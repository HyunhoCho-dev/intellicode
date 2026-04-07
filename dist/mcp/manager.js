"use strict";
/**
 * MCP (Model Context Protocol) server manager
 *
 * Loads MCP server configurations from ~/.intellicode/mcp.json,
 * starts them as child processes communicating via stdio JSON-RPC,
 * and exposes their tools to the agent.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.McpManager = void 0;
const child_process = __importStar(require("child_process"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
// ─── Live server instance ──────────────────────────────────────────────────────
class McpServerInstance {
    constructor(config) {
        this.buffer = '';
        this.pending = new Map();
        this.idCounter = 1;
        this.tools = [];
        this.serverName = config.name;
        this.proc = child_process.spawn(config.command, config.args ?? [], {
            env: { ...process.env, ...(config.env ?? {}) },
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        this.proc.stdout.on('data', (data) => {
            this.buffer += data.toString();
            this.processBuffer();
        });
        this.proc.stderr.on('data', (data) => {
            // Log server stderr to our stderr for debugging
            process.stderr.write(`[MCP:${config.name}] ${data.toString()}`);
        });
        this.proc.on('error', (err) => {
            console.error(`[MCP:${config.name}] Process error: ${err.message}`);
        });
    }
    processBuffer() {
        const lines = this.buffer.split('\n');
        this.buffer = lines.pop() ?? '';
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed)
                continue;
            try {
                const msg = JSON.parse(trimmed);
                const pending = this.pending.get(msg.id);
                if (pending) {
                    this.pending.delete(msg.id);
                    if (msg.error) {
                        pending.reject(new Error(`MCP error ${msg.error.code}: ${msg.error.message}`));
                    }
                    else {
                        pending.resolve(msg);
                    }
                }
            }
            catch {
                // ignore malformed lines
            }
        }
    }
    send(method, params) {
        return new Promise((resolve, reject) => {
            if (!this.proc.stdin || this.proc.stdin.destroyed || !this.proc.stdin.writable) {
                reject(new Error(`Cannot send "${method}" to MCP server "${this.serverName}": stdin is not writable`));
                return;
            }
            const id = this.idCounter++;
            const msg = { jsonrpc: '2.0', id, method, params };
            this.pending.set(id, { resolve, reject });
            this.proc.stdin.write(JSON.stringify(msg) + '\n');
            // Timeout after 10 seconds
            setTimeout(() => {
                if (this.pending.has(id)) {
                    this.pending.delete(id);
                    reject(new Error(`MCP request "${method}" timed out after 10 s`));
                }
            }, 10000);
        });
    }
    async initialize() {
        await this.send('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            clientInfo: { name: 'intellicode', version: '0.1.0' },
        });
        await this.send('notifications/initialized');
        await this.refreshTools();
    }
    async refreshTools() {
        try {
            const res = await this.send('tools/list');
            const result = res.result;
            this.tools = result?.tools ?? [];
        }
        catch {
            this.tools = [];
        }
    }
    getTools() {
        return this.tools;
    }
    async callTool(toolName, args) {
        const res = await this.send('tools/call', {
            name: toolName,
            arguments: args,
        });
        const result = res.result;
        if (!result?.content)
            return '(no result)';
        return result.content
            .filter((c) => c.type === 'text')
            .map((c) => c.text ?? '')
            .join('\n');
    }
    shutdown() {
        try {
            this.proc.stdin.end();
            this.proc.kill('SIGTERM');
        }
        catch {
            // ignore errors on shutdown
        }
    }
}
// ─── Manager ──────────────────────────────────────────────────────────────────
const MCP_CONFIG_FILE = path.join(os.homedir(), '.intellicode', 'mcp.json');
class McpManager {
    constructor() {
        this.servers = [];
    }
    /** Load and start all configured MCP servers. */
    async load() {
        const configs = this.readConfigs();
        for (const config of configs) {
            try {
                console.log(`\x1b[90m[MCP] Starting server: ${config.name}\x1b[0m`);
                const server = new McpServerInstance(config);
                await server.initialize();
                this.servers.push(server);
                console.log(`\x1b[90m[MCP] ${config.name} ready — ${server.getTools().length} tools\x1b[0m`);
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.error(`\x1b[31m[MCP] Failed to start "${config.name}": ${msg}\x1b[0m`);
            }
        }
    }
    readConfigs() {
        try {
            if (fs.existsSync(MCP_CONFIG_FILE)) {
                const raw = JSON.parse(fs.readFileSync(MCP_CONFIG_FILE, 'utf-8'));
                return raw.servers ?? [];
            }
        }
        catch {
            // ignore
        }
        return [];
    }
    /** Return all tool definitions from all running MCP servers. */
    getToolDefinitions() {
        const defs = [];
        for (const server of this.servers) {
            for (const tool of server.getTools()) {
                defs.push({
                    type: 'function',
                    function: {
                        name: `mcp__${server.serverName}__${tool.name}`,
                        description: `[MCP:${server.serverName}] ` + (tool.description ?? tool.name),
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
    async callTool(qualifiedName, args) {
        const prefix = 'mcp__';
        if (!qualifiedName.startsWith(prefix))
            return null;
        const withoutPrefix = qualifiedName.slice(prefix.length);
        const separatorIdx = withoutPrefix.indexOf('__');
        if (separatorIdx === -1)
            return null;
        const serverName = withoutPrefix.slice(0, separatorIdx);
        const toolName = withoutPrefix.slice(separatorIdx + 2);
        const server = this.servers.find((s) => s.serverName === serverName);
        if (!server) {
            return `Error: MCP server "${serverName}" is not running.`;
        }
        return server.callTool(toolName, args);
    }
    /** Shut down all MCP servers. */
    shutdown() {
        for (const server of this.servers) {
            server.shutdown();
        }
        this.servers = [];
    }
    /** Write a sample MCP config file if none exists. */
    static createSampleConfig() {
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
    static getConfigPath() {
        return MCP_CONFIG_FILE;
    }
}
exports.McpManager = McpManager;
//# sourceMappingURL=manager.js.map