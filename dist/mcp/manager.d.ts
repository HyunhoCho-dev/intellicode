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
 * (e.g. `npx.cmd`, `pnpm.cmd`).  Node's `child_process.spawn` does NOT
 * search for `.cmd` files unless `shell: true` is used, which causes the
 * dreaded `spawn npx ENOENT` error.  This helper appends the `.cmd` suffix on
 * Windows for common Node-ecosystem binaries so they can be spawned directly.
 */
export declare function resolveCommand(command: string): string;
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