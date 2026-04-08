/**
 * MCP (Model Context Protocol) server manager
 *
 * Loads MCP server configurations from ~/.intellicode/mcp.json,
 * starts them as child processes communicating via stdio JSON-RPC,
 * and exposes their tools to the agent.
 */

import * as child_process from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ToolDefinition } from '../providers/github-copilot';

// ─── Spawn timeout ────────────────────────────────────────────────────────────

/**
 * How long (ms) to wait for an MCP server process to start and respond to the
 * `initialize` handshake.  Smithery skills downloaded via npx may take
 * several seconds to fetch and boot, so we use a generous 60 s timeout.
 */
const MCP_INIT_TIMEOUT_MS = 60_000;

// ─── Platform helpers ─────────────────────────────────────────────────────────

/**
 * On Windows, Node/npm CLI executables are installed as `.cmd` batch files
 * (e.g. `npx.cmd`, `pnpm.cmd`).  When spawning a process directly (without
 * `shell: true`), Node.js cannot execute `.cmd` files and raises `EINVAL`.
 *
 * Resolution strategy:
 *   - On Windows we always spawn with `{ shell: true }` so that `cmd.exe`
 *     handles `.cmd` resolution automatically — no manual suffix needed.
 *   - On non-Windows platforms we keep `shell: false` for security and
 *     predictability.
 *
 * `resolveCommand` is retained for completeness / external callers but the
 * `.cmd` suffix is no longer required when `useShell()` returns `true`.
 */
export function resolveCommand(command: string): string {
  // On Windows with shell:true, cmd.exe finds .cmd files automatically.
  // We still keep the helper in case callers need the raw resolved name.
  return command;
}

/**
 * Whether to use `{ shell: true }` when spawning child processes.
 * Required on Windows so that `.cmd` wrapper scripts (npx, npm, …) work.
 */
export function useShell(): boolean {
  return os.platform() === 'win32';
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface McpServerConfig {
  /** Human-readable name for the server. */
  name: string;
  /** Command to launch the server (e.g. "node", "python"). */
  command: string;
  /** Arguments passed to the command. */
  args?: string[];
  /** Additional environment variables for the server process. */
  env?: Record<string, string>;
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

// ─── Live server instance ──────────────────────────────────────────────────────

class McpServerInstance {
  private proc: child_process.ChildProcess;
  private buffer = '';
  private pending: Map<
    number,
    { resolve: (r: JsonRpcResponse) => void; reject: (e: Error) => void }
  > = new Map();
  private idCounter = 1;
  private tools: McpTool[] = [];
  public readonly serverName: string;

  constructor(config: McpServerConfig) {
    this.serverName = config.name;

    const shell = useShell();

    this.proc = child_process.spawn(config.command, config.args ?? [], {
      env: { ...process.env, ...(config.env ?? {}) },
      stdio: ['pipe', 'pipe', 'pipe'],
      // Windows: shell:true is required to run .cmd wrapper scripts (npx, npm…)
      // without triggering EINVAL.  On other platforms we skip it for security.
      shell,
    });

    this.proc.stdout!.on('data', (data: Buffer) => {
      this.buffer += data.toString();
      this.processBuffer();
    });

    this.proc.stderr!.on('data', (data: Buffer) => {
      // Log server stderr to our stderr for debugging (suppress in non-TTY)
      if (process.stderr.isTTY) {
        process.stderr.write(`[MCP:${config.name}] ${data.toString()}`);
      }
    });

    this.proc.on('error', (err: NodeJS.ErrnoException) => {
      // Surface spawn errors (ENOENT, EINVAL, …) to pending requests so the
      // caller gets a meaningful rejection instead of a silent timeout.
      const detail =
        err.code === 'ENOENT'
          ? `command not found: "${config.command}"`
          : err.code === 'EINVAL'
          ? `invalid spawn arguments — on Windows, ensure Node.js is in PATH`
          : err.message;
      const spawnError = new Error(
        `Failed to start MCP server "${config.name}": ${detail}`
      );
      // Reject all pending promises so they don't hang until timeout
      for (const [id, handlers] of this.pending) {
        this.pending.delete(id);
        handlers.reject(spawnError);
      }
    });
  }

  private processBuffer(): void {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed) as JsonRpcResponse;
        const pending = this.pending.get(msg.id);
        if (pending) {
          this.pending.delete(msg.id);
          if (msg.error) {
            pending.reject(
              new Error(`MCP error ${msg.error.code}: ${msg.error.message}`)
            );
          } else {
            pending.resolve(msg);
          }
        }
      } catch {
        // ignore malformed lines
      }
    }
  }

  private send(method: string, params?: unknown, timeoutMs = 10_000): Promise<JsonRpcResponse> {
    return new Promise((resolve, reject) => {
      if (!this.proc.stdin || this.proc.stdin.destroyed || !this.proc.stdin.writable) {
        reject(
          new Error(
            `Cannot send "${method}" to MCP server "${this.serverName}": stdin is not writable`
          )
        );
        return;
      }

      const id = this.idCounter++;
      const msg: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
      this.pending.set(id, { resolve, reject });
      this.proc.stdin!.write(JSON.stringify(msg) + '\n');

      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(
            new Error(`MCP request "${method}" timed out after ${timeoutMs / 1000} s`)
          );
        }
      }, 10_000);
    });
  }

  /**
   * Perform the MCP handshake with the server process.
   *
   * Uses a generous timeout (`MCP_INIT_TIMEOUT_MS`) because skills installed
   * via `npx` may need to download the package before the process is ready.
   */
  async initialize(): Promise<void> {
    await this.send(
      'initialize',
      {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        clientInfo: { name: 'intellicode', version: '0.1.0' },
      },
      MCP_INIT_TIMEOUT_MS
    );
    await this.send('notifications/initialized', undefined, MCP_INIT_TIMEOUT_MS);
    await this.refreshTools();
  }

  async refreshTools(): Promise<void> {
    try {
      const res = await this.send('tools/list');
      const result = res.result as { tools?: McpTool[] };
      this.tools = result?.tools ?? [];
    } catch {
      this.tools = [];
    }
  }

  getTools(): McpTool[] {
    return this.tools;
  }

  async callTool(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<string> {
    const res = await this.send('tools/call', {
      name: toolName,
      arguments: args,
    });
    const result = res.result as {
      content?: Array<{ type: string; text?: string }>;
    };
    if (!result?.content) return '(no result)';
    return result.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('\n');
  }

  shutdown(): void {
    try {
      this.proc.stdin!.end();
      this.proc.kill('SIGTERM');
    } catch {
      // ignore errors on shutdown
    }
  }
}

// ─── Manager ──────────────────────────────────────────────────────────────────

const MCP_CONFIG_FILE = path.join(os.homedir(), '.intellicode', 'mcp.json');

export class McpManager {
  private servers: McpServerInstance[] = [];

  /** Load and start all configured MCP servers. */
  async load(): Promise<void> {
    const configs = this.readConfigs();
    for (const config of configs) {
      try {
        console.log(
          `\x1b[90m[MCP] Starting server: ${config.name}\x1b[0m`
        );
        const server = new McpServerInstance(config);
        await server.initialize();
        this.servers.push(server);
        console.log(
          `\x1b[90m[MCP] ${config.name} ready — ${server.getTools().length} tools\x1b[0m`
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          `\x1b[31m[MCP] Failed to start "${config.name}": ${msg}\x1b[0m`
        );
      }
    }
  }

  /**
   * Install (persist config) and start a new MCP server at runtime.
   * Called by the agent via the `mcp_configure` tool.
   */
  async installAndStartServer(config: McpServerConfig): Promise<void> {
    // Persist to config file (add if not already there)
    const configs = this.readConfigs();
    const existing = configs.findIndex((c) => c.name === config.name);
    if (existing >= 0) {
      configs[existing] = config; // update existing entry
    } else {
      configs.push(config);
    }
    this.saveConfigs(configs);

    // Remove a previously-running server with the same name (re-register case)
    const runningIdx = this.servers.findIndex(
      (s) => s.serverName === config.name
    );
    if (runningIdx >= 0) {
      this.servers[runningIdx].shutdown();
      this.servers.splice(runningIdx, 1);
    }

    // Start the server
    const server = new McpServerInstance(config);
    await server.initialize();
    this.servers.push(server);
  }

  /** Return all persisted server configurations. */
  getConfigs(): McpServerConfig[] {
    return this.readConfigs();
  }

  private readConfigs(): McpServerConfig[] {
    try {
      if (fs.existsSync(MCP_CONFIG_FILE)) {
        const raw = JSON.parse(
          fs.readFileSync(MCP_CONFIG_FILE, 'utf-8')
        ) as { servers?: McpServerConfig[] };
        return raw.servers ?? [];
      }
    } catch {
      // ignore
    }
    return [];
  }

  private saveConfigs(configs: McpServerConfig[]): void {
    const dir = path.dirname(MCP_CONFIG_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(
      MCP_CONFIG_FILE,
      JSON.stringify({ servers: configs }, null, 2),
      { mode: 0o600 }
    );
  }

  /** Return all tool definitions from all running MCP servers. */
  getToolDefinitions(): ToolDefinition[] {
    const defs: ToolDefinition[] = [];
    for (const server of this.servers) {
      for (const tool of server.getTools()) {
        defs.push({
          type: 'function',
          function: {
            name: `mcp__${server.serverName}__${tool.name}`,
            description:
              `[MCP:${server.serverName}] ` + (tool.description ?? tool.name),
            parameters: tool.inputSchema ?? {
              type: 'object',
              properties: {},
              required: [],
            },
          },
        });
      }
    }
    return defs;
  }

  /**
   * Call an MCP tool by its fully-qualified name
   * (format: `mcp__<serverName>__<toolName>`).
   */
  async callTool(
    qualifiedName: string,
    args: Record<string, unknown>
  ): Promise<string | null> {
    const prefix = 'mcp__';
    if (!qualifiedName.startsWith(prefix)) return null;

    const withoutPrefix = qualifiedName.slice(prefix.length);
    const separatorIdx = withoutPrefix.indexOf('__');
    if (separatorIdx === -1) return null;

    const serverName = withoutPrefix.slice(0, separatorIdx);
    const toolName = withoutPrefix.slice(separatorIdx + 2);

    const server = this.servers.find((s) => s.serverName === serverName);
    if (!server) {
      return `Error: MCP server "${serverName}" is not running.`;
    }

    return server.callTool(toolName, args);
  }

  /** Shut down all MCP servers. */
  shutdown(): void {
    for (const server of this.servers) {
      server.shutdown();
    }
    this.servers = [];
  }

  /** Write a sample MCP config file if none exists. */
  static createSampleConfig(): void {
    const dir = path.dirname(MCP_CONFIG_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(MCP_CONFIG_FILE)) {
      const sample = {
        servers: [
          {
            name: 'example-server',
            command: 'node',
            args: ['/path/to/your/mcp-server/index.js'],
            env: {},
          },
        ],
      };
      fs.writeFileSync(MCP_CONFIG_FILE, JSON.stringify(sample, null, 2));
      console.log(`Sample MCP config created at: ${MCP_CONFIG_FILE}`);
    }
  }

  static getConfigPath(): string {
    return MCP_CONFIG_FILE;
  }
}
