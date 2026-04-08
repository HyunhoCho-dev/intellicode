/**
 * Smithery Skills Manager
 *
 * Provides integration with the Smithery MCP server registry for skill
 * discovery, installation, removal, and creation.
 *
 * Key concepts:
 *   - A "skill" in IntelliCode is a Smithery-registered MCP server that
 *     extends the agent's capabilities with new tools.
 *   - Skills are persisted in ~/.intellicode/skills.json, separate from
 *     manually configured MCP servers (~/.intellicode/mcp.json).
 *   - The Smithery registry API is used for discovery (no API key required
 *     for read-only registry searches).
 *
 * Smithery Registry API: https://registry.smithery.ai/servers
 */
import { McpManager, McpServerConfig } from '../mcp/manager';
/** A server record returned by the Smithery registry API. */
export interface SmitheryServer {
    /** Fully qualified name, e.g. "smithery/hello-world" or "@author/server-name". */
    qualifiedName: string;
    /** Human-readable display name. */
    displayName: string;
    /** Short description of what the server/skill provides. */
    description: string;
    /** Number of uses/installs recorded by the registry. */
    useCount?: number;
    /** Whether the server is verified by Smithery. */
    isVerified?: boolean;
    /** Whether the server supports remote (hosted) connections. */
    remote?: boolean;
    /** Homepage or source URL. */
    homepage?: string;
}
/** A skill that has been installed (persisted in skills.json). */
export interface InstalledSkill {
    /** Unique name used to reference this skill in IntelliCode. */
    name: string;
    /** The Smithery qualifiedName (e.g. "smithery/hello-world"). */
    qualifiedName: string;
    /** Short description shown in /skills list. */
    description: string;
    /** ISO timestamp of when the skill was installed. */
    installedAt: string;
    /** MCP server configuration used to launch this skill. */
    mcpConfig: McpServerConfig;
}
/**
 * Manages the lifecycle of Smithery skills:
 *   - Discovery via the Smithery registry API
 *   - Installation (persisting config + starting as an MCP server)
 *   - Removal
 *   - Interactive scaffolding of new skills
 */
export declare class SkillsManager {
    private mcpManager;
    constructor(mcpManager: McpManager);
    /**
     * Search the Smithery registry for MCP servers/skills matching the query.
     *
     * @param query  Search terms (e.g. "github", "filesystem", "web search").
     * @param limit  Maximum number of results to return (default: 10).
     * @returns      Array of matching Smithery server records.
     * @throws       Error if the network request fails.
     */
    search(query: string, limit?: number): Promise<SmitheryServer[]>;
    /**
     * Fetch the top skills from the Smithery registry (sorted by popularity).
     *
     * @param limit  Maximum number of results (default: 10).
     */
    listPopular(limit?: number): Promise<SmitheryServer[]>;
    /**
     * Return all installed skills from the config file.
     */
    listInstalled(): InstalledSkill[];
    /**
     * Install a skill: persist it to skills.json and start it as an MCP server.
     *
     * @param qualifiedName  The Smithery server identifier (e.g. "@org/server").
     * @param localName      A short local alias used to reference the skill.
     * @param description    Optional description.
     */
    install(qualifiedName: string, localName: string, description?: string): Promise<void>;
    /**
     * Remove an installed skill by local name.
     * Also shuts down the MCP server if it is running.
     *
     * @param localName  The local alias of the skill to remove.
     * @returns          `true` if the skill was found and removed; `false` otherwise.
     */
    remove(localName: string): boolean;
    /**
     * Scaffold a new local skill as a minimal MCP server TypeScript project.
     *
     * Creates the following structure under `outputDir/`:
     *   <outputDir>/
     *     package.json
     *     tsconfig.json
     *     src/index.ts        — MCP server entry point
     *     README.md
     *
     * @param skillName   Human-readable skill name (used in package.json and README).
     * @param description Short description for the skill.
     * @param outputDir   Directory to create the project in.
     */
    scaffold(skillName: string, description: string, outputDir: string): void;
    /**
     * Normalize a raw string into a safe local skill identifier.
     * Lowercases the input, replaces non-alphanumeric chars with hyphens,
     * strips leading/trailing hyphens, and falls back to "skill" if empty.
     */
    sanitizeName(name: string): string;
    /** Read the skills config from disk, returning an empty array on failure. */
    private readConfig;
    /** Persist the skills array to disk. */
    private writeConfig;
    /**
     * Make a simple HTTPS GET request and return the response body as a string.
     *
     * Uses Node's built-in `https` module so no extra dependencies are needed.
     *
     * @param hostname  The target hostname (e.g. "registry.smithery.ai").
     * @param urlPath   The path + query string (e.g. "/servers?q=github&pageSize=10").
     * @param timeoutMs Request timeout in milliseconds (default: 10 000).
     */
    private httpsGet;
    /** Return the path to the skills config file. */
    static getConfigPath(): string;
}
//# sourceMappingURL=manager.d.ts.map