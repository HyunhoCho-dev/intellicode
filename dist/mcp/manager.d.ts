/**
 * MCP (Model Context Protocol) server manager
 *
 * Loads MCP server configurations from ~/.intellicode/mcp.json,
 * starts them as child processes communicating via stdio JSON-RPC,
 * and exposes their tools to the agent.
 */
import { ToolDefinition } from '../providers/github-copilot';
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
export declare function resolveCommand(command: string): string;
/**
 * Whether to use `{ shell: true }` when spawning child processes.
 * Required on Windows so that `.cmd` wrapper scripts (npx, npm, …) work.
 */
export declare function useShell(): boolean;
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
export declare class McpManager {
    private servers;
    /** Load and start all configured MCP servers. */
    load(): Promise<void>;
    /**
     * Install (persist config) and start a new MCP server at runtime.
     * Called by the agent via the `mcp_configure` tool.
     */
    installAndStartServer(config: McpServerConfig): Promise<void>;
    /** Return all persisted server configurations. */
    getConfigs(): McpServerConfig[];
    private readConfigs;
    private saveConfigs;
    /** Return all tool definitions from all running MCP servers. */
    getToolDefinitions(): ToolDefinition[];
    /**
     * Call an MCP tool by its fully-qualified name
     * (format: `mcp__<serverName>__<toolName>`).
     */
    callTool(qualifiedName: string, args: Record<string, unknown>): Promise<string | null>;
    /** Shut down all MCP servers. */
    shutdown(): void;
    /** Write a sample MCP config file if none exists. */
    static createSampleConfig(): void;
    static getConfigPath(): string;
}
//# sourceMappingURL=manager.d.ts.map