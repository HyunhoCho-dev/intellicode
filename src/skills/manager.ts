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

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as https from 'https';
import { McpManager, McpServerConfig } from '../mcp/manager';

// ─── Constants ─────────────────────────────────────────────────────────────────

const SKILLS_CONFIG_FILE = path.join(os.homedir(), '.intellicode', 'skills.json');
const SMITHERY_REGISTRY_BASE = 'registry.smithery.ai';

// ─── Smithery API types ────────────────────────────────────────────────────────

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

interface SmitherySearchResponse {
  servers: SmitheryServer[];
  pagination?: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    pageSize: number;
  };
}

// ─── Installed skill record ────────────────────────────────────────────────────

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

// ─── SkillsManager ────────────────────────────────────────────────────────────

/**
 * Manages the lifecycle of Smithery skills:
 *   - Discovery via the Smithery registry API
 *   - Installation (persisting config + starting as an MCP server)
 *   - Removal
 *   - Interactive scaffolding of new skills
 */
export class SkillsManager {
  private mcpManager: McpManager;

  constructor(mcpManager: McpManager) {
    this.mcpManager = mcpManager;
  }

  // ─── Discovery ──────────────────────────────────────────────────────────────

  /**
   * Search the Smithery registry for MCP servers/skills matching the query.
   *
   * @param query  Search terms (e.g. "github", "filesystem", "web search").
   * @param limit  Maximum number of results to return (default: 10).
   * @returns      Array of matching Smithery server records.
   * @throws       Error if the network request fails.
   */
  async search(query: string, limit = 10): Promise<SmitheryServer[]> {
    const encodedQuery = encodeURIComponent(query.trim());
    const urlPath = `/servers?q=${encodedQuery}&pageSize=${limit}&page=1`;

    const raw = await this.httpsGet(SMITHERY_REGISTRY_BASE, urlPath);
    const data = JSON.parse(raw) as SmitherySearchResponse;
    return data.servers ?? [];
  }

  /**
   * Fetch the top skills from the Smithery registry (sorted by popularity).
   *
   * @param limit  Maximum number of results (default: 10).
   */
  async listPopular(limit = 10): Promise<SmitheryServer[]> {
    const urlPath = `/servers?pageSize=${limit}&page=1`;
    const raw = await this.httpsGet(SMITHERY_REGISTRY_BASE, urlPath);
    const data = JSON.parse(raw) as SmitherySearchResponse;
    return data.servers ?? [];
  }

  // ─── Installed skill management ─────────────────────────────────────────────

  /**
   * Return all installed skills from the config file.
   */
  listInstalled(): InstalledSkill[] {
    return this.readConfig();
  }

  /**
   * Install a skill: persist it to skills.json and start it as an MCP server.
   *
   * @param qualifiedName  The Smithery server identifier (e.g. "@org/server").
   * @param localName      A short local alias used to reference the skill.
   * @param description    Optional description.
   */
  async install(
    qualifiedName: string,
    localName: string,
    description = ''
  ): Promise<void> {
    const safeName = this.sanitizeName(localName);

    const mcpConfig: McpServerConfig = {
      name: safeName,
      command: 'npx',
      args: ['-y', `@smithery/cli@latest`, 'run', qualifiedName, '--client', 'claude'],
      env: {},
    };

    // Persist before starting so the skill survives restarts even if startup fails
    const skills = this.readConfig();
    const existingIdx = skills.findIndex((s) => s.name === safeName);
    const entry: InstalledSkill = {
      name: safeName,
      qualifiedName,
      description,
      installedAt: new Date().toISOString(),
      mcpConfig,
    };

    if (existingIdx >= 0) {
      skills[existingIdx] = entry;
    } else {
      skills.push(entry);
    }
    this.writeConfig(skills);

    // Start as an MCP server (may throw — caller handles the error)
    await this.mcpManager.installAndStartServer(mcpConfig);
  }

  /**
   * Remove an installed skill by local name.
   * Also shuts down the MCP server if it is running.
   *
   * @param localName  The local alias of the skill to remove.
   * @returns          `true` if the skill was found and removed; `false` otherwise.
   */
  remove(localName: string): boolean {
    const skills = this.readConfig();
    const idx = skills.findIndex((s) => s.name === localName);
    if (idx === -1) return false;

    skills.splice(idx, 1);
    this.writeConfig(skills);
    return true;
  }

  // ─── Skill scaffolding ──────────────────────────────────────────────────────

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
  scaffold(skillName: string, description: string, outputDir: string): void {
    const safeName = this.sanitizeName(skillName) || 'my-skill';

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const srcDir = path.join(outputDir, 'src');
    if (!fs.existsSync(srcDir)) {
      fs.mkdirSync(srcDir, { recursive: true });
    }

    // package.json
    const pkg = {
      name: safeName,
      version: '0.1.0',
      description,
      main: 'dist/index.js',
      bin: { [safeName]: 'dist/index.js' },
      scripts: {
        build: 'tsc',
        start: 'node dist/index.js',
        dev: 'ts-node src/index.ts',
      },
      dependencies: {
        '@modelcontextprotocol/sdk': '^1.0.0',
      },
      devDependencies: {
        typescript: '^5.4.0',
        '@types/node': '^20.0.0',
        'ts-node': '^10.9.0',
      },
    };
    fs.writeFileSync(
      path.join(outputDir, 'package.json'),
      JSON.stringify(pkg, null, 2) + '\n'
    );

    // tsconfig.json
    const tsconfig = {
      compilerOptions: {
        target: 'ES2020',
        module: 'commonjs',
        lib: ['ES2020'],
        outDir: './dist',
        rootDir: './src',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
      },
      include: ['src'],
      exclude: ['node_modules', 'dist'],
    };
    fs.writeFileSync(
      path.join(outputDir, 'tsconfig.json'),
      JSON.stringify(tsconfig, null, 2) + '\n'
    );

    // src/index.ts — minimal MCP server template
    const indexTs = `#!/usr/bin/env node
/**
 * ${skillName} — MCP Skill
 *
 * ${description}
 *
 * This is a minimal MCP (Model Context Protocol) server that exposes one
 * example tool. Edit the tool definitions and handler below to add your
 * own capabilities.
 *
 * Built with the official MCP TypeScript SDK:
 *   https://github.com/modelcontextprotocol/typescript-sdk
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// ─── Tool definitions ───────────────────────────────────────────────────────

/**
 * Describe your skill's tools here.
 * Each tool needs a name, description, and inputSchema (JSON Schema).
 */
const TOOLS = [
  {
    name: 'hello',
    description: 'A simple example tool — greets a given name.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          description: 'The name to greet.',
        },
      },
      required: ['name'],
    },
  },
];

// ─── Tool handlers ──────────────────────────────────────────────────────────

/**
 * Execute the requested tool and return a text result.
 *
 * @param toolName  The name of the tool to execute.
 * @param args      The validated tool arguments.
 * @returns         A text response string.
 * @throws          Error if the tool is unknown or arguments are invalid.
 */
async function handleToolCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<string> {
  switch (toolName) {
    case 'hello': {
      const name = args['name'] as string;
      if (!name?.trim()) {
        throw new Error('The "name" argument is required and must be non-empty.');
      }
      return \`Hello, \${name.trim()}! This is the ${skillName} skill.\`;
    }

    default:
      throw new Error(\`Unknown tool: "\${toolName}"\`);
  }
}

// ─── Server setup ───────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const server = new Server(
    { name: '${safeName}', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: rawArgs } = request.params;
    const args = (rawArgs ?? {}) as Record<string, unknown>;

    try {
      const text = await handleToolCall(name, args);
      return { content: [{ type: 'text', text }] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text', text: \`Error: \${msg}\` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(\`Fatal: \${err instanceof Error ? err.message : String(err)}\\n\`);
  process.exit(1);
});
`;
    fs.writeFileSync(path.join(srcDir, 'index.ts'), indexTs);

    // README.md
    const readme = `# ${skillName}

${description}

## Overview

This is an MCP (Model Context Protocol) skill for IntelliCode, built on the
[Smithery](https://smithery.ai) ecosystem. It exposes tools that extend the
IntelliCode agent's capabilities.

## Getting Started

\`\`\`bash
npm install
npm run build
\`\`\`

## Adding to IntelliCode

Once your skill is ready, you can use it locally by registering it as an MCP
server in IntelliCode. First build it, then add the entry to
\`~/.intellicode/skills.json\` or publish it to Smithery:

\`\`\`bash
# Option A — run locally and register via the agent:
# Ask the agent: "configure an MCP server named ${safeName} using node dist/index.js"

# Option B — publish to Smithery and install via /skills:
npx @smithery/cli@latest publish
# Then in IntelliCode:
# /skills add <your-smithery-qualifiedName> ${safeName}
\`\`\`

## Available Tools

| Tool    | Description                  |
|---------|------------------------------|
| hello   | Greets a name (example tool) |

## Publishing to Smithery

To share your skill with the community, publish it to the Smithery registry:

\`\`\`bash
npx @smithery/cli@latest publish
\`\`\`

See [Smithery docs](https://smithery.ai/docs) for details.
`;
    fs.writeFileSync(path.join(outputDir, 'README.md'), readme);
  }

  // ─── Helpers (public for reuse by CLI command handlers) ─────────────────────

  /**
   * Normalize a raw string into a safe local skill identifier.
   * Lowercases the input, replaces non-alphanumeric chars with hyphens,
   * strips leading/trailing hyphens, and falls back to "skill" if empty.
   */
  sanitizeName(name: string): string {
    return (
      name
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '-')
        .replace(/^-+|-+$/g, '')
      || 'skill'
    );
  }

  /** Read the skills config from disk, returning an empty array on failure. */
  private readConfig(): InstalledSkill[] {
    try {
      if (fs.existsSync(SKILLS_CONFIG_FILE)) {
        const raw = JSON.parse(
          fs.readFileSync(SKILLS_CONFIG_FILE, 'utf-8')
        ) as { skills?: InstalledSkill[] };
        return raw.skills ?? [];
      }
    } catch {
      // Treat a corrupt config as empty
    }
    return [];
  }

  /** Persist the skills array to disk. */
  private writeConfig(skills: InstalledSkill[]): void {
    const dir = path.dirname(SKILLS_CONFIG_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(
      SKILLS_CONFIG_FILE,
      JSON.stringify({ skills }, null, 2),
      { mode: 0o600 }
    );
  }

  /**
   * Make a simple HTTPS GET request and return the response body as a string.
   *
   * Uses Node's built-in `https` module so no extra dependencies are needed.
   *
   * @param hostname  The target hostname (e.g. "registry.smithery.ai").
   * @param urlPath   The path + query string (e.g. "/servers?q=github&pageSize=10").
   * @param timeoutMs Request timeout in milliseconds (default: 10 000).
   */
  private httpsGet(
    hostname: string,
    urlPath: string,
    timeoutMs = 10_000
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const options: https.RequestOptions = {
        hostname,
        path: urlPath,
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'intellicode-agent/1.0',
        },
        timeout: timeoutMs,
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode !== undefined && res.statusCode >= 400) {
            reject(
              new Error(
                `Smithery registry returned HTTP ${res.statusCode}: ${body.slice(0, 200)}`
              )
            );
          } else {
            resolve(body);
          }
        });
      });

      req.on('timeout', () => {
        req.destroy(new Error(`Request to ${hostname} timed out after ${timeoutMs} ms`));
      });

      req.on('error', (err) => reject(err));
      req.end();
    });
  }

  /** Return the path to the skills config file. */
  static getConfigPath(): string {
    return SKILLS_CONFIG_FILE;
  }
}
