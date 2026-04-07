/**
 * MCP (Model Context Protocol) server manager
 *
 * Loads MCP server configurations from ~/.intellicode/mcp.json,
 * starts them as child processes communicating via stdio JSON-RPC,
 * and exposes their tools to the agent.
 */
import { ToolDefinition } from '../providers/github-copilot';
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
    private readConfigs;
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