/**
 * Agent planner
 *
 * Implements the agentic reasoning loop:
 *   1. Accept user input.
 *   2. Build a message history with the system prompt.
 *   3. Call the Copilot LLM with all registered tools.
 *   4. Execute any tool calls returned by the LLM.
 *   5. Feed results back and repeat until the LLM produces a final answer.
 *   6. Stream tokens to stdout as they arrive.
 */

import {
  streamChatCompletion,
  Message,
  ToolDefinition,
  ToolCall,
} from '../providers/github-copilot';
import { fsTools, FsTool } from '../tools/fs';
import { shellTools, ShellTool } from '../tools/shell';
import { McpManager } from '../mcp/manager';
import { MemoryManager } from '../memory/manager';
import { SkillsManager } from '../skills/manager';
import { createExecutingSpinner } from '../ui';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ThinkLevel = 'off' | 'low' | 'medium' | 'high';

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are IntelliCode, an expert AI software engineer and technical architect running in a terminal (PowerShell or bash).
Your primary mission is to produce PRODUCTION-QUALITY code that represents the very best in software engineering craftsmanship.

════════════════════════════════════════════════════════════════════
  CODE QUALITY STANDARDS
════════════════════════════════════════════════════════════════════

Architecture & Design:
- Apply SOLID principles: Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, Dependency Inversion.
- Use established design patterns (Factory, Repository, Strategy, Observer, Decorator, etc.) where they genuinely simplify the design.
- Separate concerns: keep business logic, data access, presentation, and I/O in distinct layers.
- Prefer composition over inheritance; keep modules cohesive and loosely coupled.
- Design for extensibility — new features should require additions, not mutations to existing code.
- Avoid over-engineering: choose the simplest architecture that satisfies current requirements while leaving room to grow.

Error Handling & Robustness:
- ALWAYS handle errors explicitly. Never swallow exceptions silently.
- Validate all inputs at system boundaries (function arguments, API payloads, user input, environment variables).
- Use typed/custom error classes for domain-specific failures so callers can distinguish error types.
- Provide actionable, context-rich error messages (include what failed, why, and how to fix it).
- Handle ALL edge cases: null/undefined, empty collections, zero values, boundary conditions, concurrent access.
- Implement graceful degradation — partial failures should not bring down the whole system.
- Use retry logic with exponential back-off for transient failures (network, I/O).

Security:
- NEVER hardcode secrets, API keys, passwords, or tokens — use environment variables or secrets managers.
- Sanitize and validate all external inputs to prevent injection attacks (SQL injection, XSS, command injection).
- Apply the principle of least privilege — request only the permissions required.
- Use parameterized queries / prepared statements for database operations.
- Hash passwords with bcrypt/argon2; never store plaintext credentials.
- Set appropriate timeouts on all external calls to prevent resource exhaustion.
- Prefer HTTPS/TLS for all network communication.

Documentation & Clarity:
- Write JSDoc/TSDoc for ALL public functions, classes, and interfaces — include @param, @returns, @throws, @example.
- Write Python docstrings (Google or NumPy style) for all public functions and classes.
- Add inline comments for non-obvious logic, complex algorithms, and important decisions.
- Write self-documenting code: use descriptive names that make intent clear without relying solely on comments.
- Include a module-level comment describing the file's purpose and key concepts.
- For REST APIs: document endpoints, request/response schemas, status codes, and authentication requirements.

Naming & Readability:
- Use clear, descriptive names for variables, functions, classes, and files.
  • Functions: verb phrases describing what they do (getUserById, calculateTotalPrice).
  • Booleans: adjective/predicate form (isValid, hasPermission, canRetry).
  • Constants: SCREAMING_SNAKE_CASE for module-level; camelCase for local.
  • Types/Interfaces: PascalCase noun phrases describing the entity (UserProfile, OrderStatus).
- Avoid abbreviations unless they are universally understood (e.g. HTTP, URL, ID).
- Keep functions short and focused — if a function does more than one thing, split it.
- Limit nesting depth to 3 levels; use early returns and guard clauses to reduce indentation.

Testability:
- Write code that is inherently testable: pure functions, dependency injection, no hidden global state.
- For complex logic, include unit test examples demonstrating normal cases, edge cases, and error cases.
- Separate side-effectful code (I/O, network) from pure business logic so each can be tested independently.
- Use descriptive test names that explain the scenario: "should return null when user does not exist".
- Mock external dependencies in tests; never make real network calls or write to production databases in unit tests.

Performance:
- Choose appropriate data structures and algorithms for the scale of the problem.
- Note the time/space complexity of non-trivial algorithms in comments (e.g. O(n log n)).
- Avoid N+1 query problems; batch database/API calls where possible.
- Prefer lazy evaluation and streaming for large data sets to minimize memory usage.
- Profile before optimizing — premature optimization is the root of much evil; but obvious inefficiencies should be avoided.

════════════════════════════════════════════════════════════════════
  LANGUAGE-SPECIFIC BEST PRACTICES
════════════════════════════════════════════════════════════════════

TypeScript / JavaScript:
- Enable strict mode in tsconfig ("strict": true); use explicit types — avoid "any".
- Prefer "const" over "let"; avoid "var".
- Use async/await over raw Promises; always handle rejections.
- Use optional chaining (?.) and nullish coalescing (??) for safe property access.
- Export types and interfaces separately from implementation; use barrel (index.ts) exports.
- Prefer functional array methods (map, filter, reduce) over imperative loops for transformations.
- Use Zod or class-validator for runtime schema validation of external data.

Python:
- Use type annotations everywhere (PEP 484, PEP 526); run mypy for static analysis.
- Prefer dataclasses or Pydantic models for structured data over plain dicts.
- Use context managers (with statements) for resource management (files, DB connections).
- Use pathlib.Path instead of os.path for file system operations.
- Use f-strings for string formatting; avoid % and .format() for new code.
- Follow PEP 8; use black for formatting and ruff/flake8 for linting.
- Raise specific exception types; never use bare "except:" clauses.

General / Cross-language:
- Follow the principle "fail fast" — detect errors as early as possible.
- Log errors at appropriate levels (DEBUG, INFO, WARNING, ERROR, CRITICAL); include context.
- Use semantic versioning for libraries and APIs.
- Write database migrations rather than mutating schemas directly.
- Always close resources in finally blocks or use RAII/context-manager patterns.

════════════════════════════════════════════════════════════════════
  POST-GENERATION SELF-REVIEW CHECKLIST
════════════════════════════════════════════════════════════════════

After generating any significant code block, mentally verify the following before presenting it.
If any item fails, fix it BEFORE showing the output:

  ✅ Architecture: Are concerns properly separated? Are SOLID principles followed?
  ✅ Error Handling: Are all errors caught and handled? Are inputs validated?
  ✅ Security: No hardcoded secrets? Inputs sanitized? Least-privilege applied?
  ✅ Documentation: JSDoc/docstrings on all public API surfaces? Key logic commented?
  ✅ Naming: Are all identifiers descriptive and self-documenting?
  ✅ Edge Cases: Empty/null inputs handled? Boundary conditions covered?
  ✅ Testability: Is the code structured so it can be unit tested without side effects?
  ✅ Completeness: Does the code actually solve the user's request end-to-end?

When presenting code to the user, briefly note:
  • Design decisions made and why (e.g. "Used Repository pattern to decouple data access")
  • Any trade-offs or limitations worth knowing
  • Suggested next steps (e.g. "Add integration tests", "Wire up the logger")

════════════════════════════════════════════════════════════════════
  TASK-SOLVING APPROACH
════════════════════════════════════════════════════════════════════

- Always reason step-by-step before taking actions. Briefly describe your plan.
- Use the available tools to explore the file system, read source code, and execute commands.
- When writing or modifying files, show a short summary of changes made.
- When running commands, interpret their output and take corrective action if needed.
- Be concise but thorough. Avoid unnecessary repetition.
- Never ask the user for permission to call a tool — just do it, then explain.
- If a task requires multiple steps, complete all of them before reporting back.
- Prefer targeted edits over rewriting entire files when fixing bugs.
- When generating a complete program or module, include a working demo/main entry point.

════════════════════════════════════════════════════════════════════
  MEMORY
════════════════════════════════════════════════════════════════════

- You have access to a memory_store tool to remember important user preferences, project conventions, or facts for future sessions.
- When a user mentions a preference, convention, or important context that should persist, store it immediately.
- Do not store trivial or temporary information — only things that will genuinely improve future interactions.

════════════════════════════════════════════════════════════════════
  MCP (Model Context Protocol) Integration
════════════════════════════════════════════════════════════════════

- You have access to MCP tools that extend your capabilities (prefixed with mcp__).
- If a user's goal requires a capability you don't have (e.g. fetching weather, browsing the web,
  querying a database), you can install and configure a new MCP server autonomously.
- To install an MCP server: use execute_command to run "npm install -g <package>" (or npx),
  then call mcp_configure with the server details to register and start it immediately.
- Common MCP packages: @modelcontextprotocol/server-brave-search (web search),
  @modelcontextprotocol/server-filesystem (enhanced FS), @modelcontextprotocol/server-github (GitHub API).
- After calling mcp_configure, the new tools will be available in your next turn.

════════════════════════════════════════════════════════════════════
  Smithery Skills Integration
════════════════════════════════════════════════════════════════════

- Smithery (https://smithery.ai) is an ecosystem of MCP servers ("skills") that extend
  AI agent capabilities — web search, file processing, APIs, and more.
- You have access to skills_search and skills_load tools to discover and install skills.
- When a user asks for a capability that might be available as a Smithery skill, proactively
  search the registry and suggest relevant options.
- To add a new skill:
    1. Call skills_search with relevant keywords (e.g. "web search", "github", "database").
    2. Present the top results to the user, including name, description, and qualifiedName.
    3. Once the user confirms, call skills_load with the qualifiedName to install and activate it.
- After skills_load succeeds, the skill's tools are available as mcp__<name>__* tools.
- You can also help users CREATE new skills. When asked, use execute_command and write_file to
  scaffold a new MCP server project, then guide the user through development and publishing.
- Remember: every Smithery skill is an MCP server — once installed, use mcp__ tools to call it.`;

// ─── Planner class ────────────────────────────────────────────────────────────

type AnyTool = FsTool | ShellTool;

// ─── Planner class ────────────────────────────────────────────────────────────

export class Planner {
  private history: Message[] = [];
  private tools: AnyTool[] = [...fsTools, ...shellTools];
  private mcpManager: McpManager;
  private memoryManager: MemoryManager;
  private skillsManager: SkillsManager;
  private model: string = 'gpt-4o';
  private thinkLevel: ThinkLevel = 'medium';

  constructor(
    mcpManager: McpManager,
    memoryManager: MemoryManager,
    model?: string,
    thinkLevel?: ThinkLevel
  ) {
    this.mcpManager = mcpManager;
    this.memoryManager = memoryManager;
    this.skillsManager = new SkillsManager(mcpManager);
    if (model) this.model = model;
    if (thinkLevel) this.thinkLevel = thinkLevel;
  }

  /** Set the model to use for completions. */
  setModel(model: string): void {
    this.model = model;
  }

  /** Get the current model. */
  getModel(): string {
    return this.model;
  }

  /** Set the thinking intensity level. */
  setThinkLevel(level: ThinkLevel): void {
    this.thinkLevel = level;
  }

  /** Get the current thinking level. */
  getThinkLevel(): ThinkLevel {
    return this.thinkLevel;
  }

  /** Clear conversation history. */
  resetHistory(): void {
    this.history = [];
  }

  /** Return current conversation history length. */
  get historyLength(): number {
    return this.history.length;
  }

  /**
   * Process a user message: run the full agentic loop and stream the response.
   *
   * @param userMessage  The user's input.
   * @param onToken      Callback for streaming text tokens.
   * @param signal       Optional AbortSignal to interrupt the response mid-stream.
   */
  async run(
    userMessage: string,
    onToken: (token: string) => void,
    signal?: AbortSignal
  ): Promise<void> {
    // Add user message to history
    this.history.push({ role: 'user', content: userMessage });

    const toolDefs = this.buildToolDefinitions();

    /**
     * Agentic loop — continues as long as the LLM requests tool calls.
     * The 20-iteration cap prevents runaway loops caused by LLM tool-call
     * cycles (e.g. a tool always returning an error that the LLM tries to
     * fix again). If the cap is reached the loop exits silently; the last
     * streamed content from the LLM is already visible to the user.
     */
    const MAX_ITERATIONS = 20;
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      // Honor cancellation between iterations (e.g. during tool execution)
      if (signal?.aborted) break;

      const messages = this.buildMessages();

      let streamStarted = false;

      const { temperature, maxTokens } = this.getThinkParams();

      const response = await streamChatCompletion(
        messages,
        toolDefs,
        (chunk) => {
          if (!streamStarted) {
            streamStarted = true;
          }
          onToken(chunk);
        },
        this.model,
        temperature,
        maxTokens,
        signal,
      );

      if (response.tool_calls.length > 0) {
        // LLM wants to call tools — but only if we haven't been asked to stop
        if (signal?.aborted) break;

        if (streamStarted) {
          // A newline after any streamed preamble
          onToken('\n');
        }

        // Record the assistant's (possibly empty) reply + tool calls
        this.history.push({
          role: 'assistant',
          content: response.content || null,
          tool_calls: response.tool_calls,
        });

        // Execute each tool call and collect results
        for (const toolCall of response.tool_calls) {
          const result = await this.executeToolCall(toolCall, onToken);

          this.history.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: result,
            name: toolCall.function.name,
          });
        }

        // Continue loop so LLM can process tool results
        continue;
      }

      // No tool calls — this is the final assistant message
      this.history.push({
        role: 'assistant',
        content: response.content,
      });

      if (!streamStarted && response.content) {
        onToken(response.content);
      }

      break;
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /** Map think level to LLM sampling parameters. */
  private getThinkParams(): { temperature: number; maxTokens: number } {
    switch (this.thinkLevel) {
      // 'high' uses temperature=0 for deterministic, careful reasoning with maximum tokens
      // for complex coding tasks that benefit from deep, step-by-step analysis
      case 'high':   return { temperature: 0,   maxTokens: 16384 };
      case 'low':    return { temperature: 0.3, maxTokens: 2048 };
      // 'off' skips deep reasoning — fast, conversational responses
      case 'off':    return { temperature: 0.7, maxTokens: 1024 };
      // 'medium' (default) — balanced for most coding tasks; temperature near-zero
      // for correctness while allowing enough tokens for well-documented output
      default:       return { temperature: 0.1, maxTokens: 8192 };
    }
  }

  /** Return a human-readable description of the current think level settings. */
  getThinkLevelDescription(): string {
    switch (this.thinkLevel) {
      case 'high':   return 'high   (temperature=0.0, max_tokens=16384)';
      case 'low':    return 'low    (temperature=0.3, max_tokens=2048)';
      case 'off':    return 'off    (disabled — fast responses, temperature=0.7, max_tokens=1024)';
      default:       return 'medium (temperature=0.1, max_tokens=8192)';
    }
  }

  /** Assemble the full message array including the system prompt. */
  private buildMessages(): Message[] {
    const memoryContext = this.memoryManager.toContextString();
    const systemContent = memoryContext
      ? `${SYSTEM_PROMPT}\n${memoryContext}`
      : SYSTEM_PROMPT;
    return [
      { role: 'system', content: systemContent },
      ...this.history,
    ];
  }

  /** Build tool definitions from built-in tools + MCP tools + mcp_configure + memory_store. */
  private buildToolDefinitions(): ToolDefinition[] {
    const builtIn: ToolDefinition[] = this.tools.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    // Special tool: let the agent install + register new MCP servers at runtime
    const mcpConfigureTool: ToolDefinition = {
      type: 'function',
      function: {
        name: 'mcp_configure',
        description:
          'Register and start a new MCP (Model Context Protocol) server so its tools become available immediately. ' +
          'Use this after installing an MCP server package to make its tools available. ' +
          'Example: after `npm install -g @modelcontextprotocol/server-brave-search`, call this to register it.',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'A unique human-readable name for the server (e.g. "brave-search").',
            },
            command: {
              type: 'string',
              description: 'The executable to launch (e.g. "npx", "node", "python").',
            },
            args: {
              type: 'array',
              items: { type: 'string' },
              description: 'Arguments for the command (e.g. ["-y", "@modelcontextprotocol/server-brave-search"]).',
            },
            env: {
              type: 'object',
              description: 'Optional environment variables (e.g. {"BRAVE_API_KEY": "..."}).',
            },
          },
          required: ['name', 'command'],
        },
      },
    };

    // Special tool: let the agent persist information to long-term memory
    const memoryStoreTool: ToolDefinition = {
      type: 'function',
      function: {
        name: 'memory_store',
        description:
          'Store a key-value pair in long-term memory so it is recalled in future sessions. ' +
          'Use this to remember user preferences, project-specific conventions, important facts, ' +
          'or recurring context. Only store information worth retaining across sessions.',
        parameters: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description: 'A short, descriptive label (e.g. "preferred_language", "project_style").',
            },
            value: {
              type: 'string',
              description: 'The information to remember.',
            },
          },
          required: ['key', 'value'],
        },
      },
    };

    // Tool: search Smithery registry for skills/MCP servers
    const skillsSearchTool: ToolDefinition = {
      type: 'function',
      function: {
        name: 'skills_search',
        description:
          'Search the Smithery registry for MCP server skills matching a keyword query. ' +
          'Returns a list of available skills (name, description, qualifiedName). ' +
          'Use this to discover new capabilities before calling skills_load.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search terms (e.g. "web search", "github", "database", "filesystem").',
            },
            limit: {
              type: 'number',
              description: 'Maximum results to return (default: 8, max: 20).',
              minimum: 1,
              maximum: 20,
            },
          },
          required: ['query'],
        },
      },
    };

    // Tool: install a Smithery skill and make it available immediately
    const skillsLoadTool: ToolDefinition = {
      type: 'function',
      function: {
        name: 'skills_load',
        description:
          'Install and activate a Smithery skill so its tools become available immediately. ' +
          'The qualifiedName comes from skills_search results (e.g. "@exa-labs/exa-mcp-server"). ' +
          'After this call succeeds, use mcp__<localName>__* tools to invoke the skill.',
        parameters: {
          type: 'object',
          properties: {
            qualifiedName: {
              type: 'string',
              description: 'The Smithery server qualifiedName from skills_search (e.g. "@exa-labs/exa-mcp-server").',
            },
            localName: {
              type: 'string',
              description: 'A short local alias for the skill (e.g. "exa", "brave-search"). Must be unique.',
            },
            description: {
              type: 'string',
              description: 'Brief description of what this skill does (optional but recommended).',
            },
          },
          required: ['qualifiedName', 'localName'],
        },
      },
    };

    const mcpDefs = this.mcpManager.getToolDefinitions();
    return [...builtIn, mcpConfigureTool, memoryStoreTool, skillsSearchTool, skillsLoadTool, ...mcpDefs];
  }

  /**
   * Execute a single tool call and return its result as a string.
   * Also streams a status line so the user can see what is happening.
   */
  private async executeToolCall(
    toolCall: ToolCall,
    onToken: (token: string) => void
  ): Promise<string> {
    const { name, arguments: argsJson } = toolCall.function;

    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(argsJson) as Record<string, unknown>;
    } catch {
      return `Error: Could not parse tool arguments: ${argsJson}`;
    }

    // Show a status indicator to the user
    onToken(
      `\n\x1b[90m⚙  ${name}(${this.formatArgs(args)})\x1b[0m\n`
    );

    // Start a sky-blue spinner while the tool is executing
    const stopSpinner = createExecutingSpinner();

    try {
      // Handle mcp_configure: install + start a new MCP server at runtime
      if (name === 'mcp_configure') {
        const serverName = args['name'] as string;
        const serverCommand = args['command'] as string;
        if (!serverName || typeof serverName !== 'string' || !serverName.trim()) {
          return 'Error: mcp_configure requires a non-empty "name" field.';
        }
        if (!serverCommand || typeof serverCommand !== 'string' || !serverCommand.trim()) {
          return 'Error: mcp_configure requires a non-empty "command" field.';
        }

        const configuredEnv = (args['env'] as Record<string, string> | undefined) ?? {};
        const serverConfig = {
          name: serverName.trim(),
          command: serverCommand.trim(),
          args: (args['args'] as string[] | undefined) ?? [],
          env: configuredEnv,
        };
        await this.mcpManager.installAndStartServer(serverConfig);
        return `MCP server "${serverConfig.name}" configured and started. Its tools are now available.`;
      }

      // Handle memory_store: persist a key-value pair for future sessions
      if (name === 'memory_store') {
        const memKey = args['key'] as string;
        const memValue = args['value'] as string;
        if (!memKey?.trim()) {
          return 'Error: memory_store requires a non-empty "key" field.';
        }
        if (!memValue || typeof memValue !== 'string') {
          return 'Error: memory_store requires a "value" field.';
        }
        this.memoryManager.set(memKey.trim(), memValue);
        return `Memory stored: "${memKey.trim()}" = "${memValue}"`;
      }

      // Handle skills_search: search Smithery registry
      if (name === 'skills_search') {
        const query = args['query'] as string;
        if (!query?.trim()) {
          return 'Error: skills_search requires a non-empty "query" field.';
        }
        const rawLimit = args['limit'];
        const limit = typeof rawLimit === 'number'
          ? Math.min(Math.max(1, rawLimit), 20)
          : 8;
        try {
          const results = await this.skillsManager.search(query.trim(), limit);
          if (results.length === 0) {
            return `No skills found for query: "${query}". Try different keywords.`;
          }
          const lines = results.map((s, i) => {
            const badge = s.isVerified ? ' [verified]' : '';
            const uses  = s.useCount !== undefined ? ` (${s.useCount.toLocaleString()} uses)` : '';
            return `${i + 1}. ${s.qualifiedName}${badge}${uses}\n   ${s.description ?? ''}`;
          });
          return `Found ${results.length} skill(s) for "${query}":\n\n${lines.join('\n\n')}`;
        } catch (searchErr) {
          const msg = searchErr instanceof Error ? searchErr.message : String(searchErr);
          return `Error searching Smithery registry: ${msg}. You can still install skills manually using mcp_configure.`;
        }
      }

      // Handle skills_load: install a Smithery skill
      if (name === 'skills_load') {
        const qualifiedName = args['qualifiedName'] as string;
        const localName = args['localName'] as string;
        const description = (args['description'] as string | undefined) ?? '';
        if (!qualifiedName?.trim()) {
          return 'Error: skills_load requires a non-empty "qualifiedName" field.';
        }
        if (!localName?.trim()) {
          return 'Error: skills_load requires a non-empty "localName" field.';
        }
        try {
          await this.skillsManager.install(qualifiedName.trim(), localName.trim(), description);
          return (
            `Skill "${localName.trim()}" (${qualifiedName}) installed and started successfully. ` +
            `Its tools are now available as mcp__${localName.trim()}__* tools.`
          );
        } catch (loadErr) {
          const msg = loadErr instanceof Error ? loadErr.message : String(loadErr);
          return (
            `Skill "${localName.trim()}" was saved to config but failed to start: ${msg}. ` +
            `It will be retried on the next IntelliCode launch.`
          );
        }
      }

      // Check MCP tools first
      if (name.startsWith('mcp__')) {
        const result = await this.mcpManager.callTool(name, args);
        return result ?? `Error: MCP tool "${name}" not found.`;
      }

      // Built-in tools
      const tool = this.tools.find((t) => t.name === name);
      if (!tool) {
        return `Error: Unknown tool "${name}".`;
      }

      const result = await tool.execute(args);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return `Error executing "${name}": ${msg}`;
    } finally {
      stopSpinner();
    }
  }

  /** Format tool arguments for display (truncate long values). */
  private formatArgs(args: Record<string, unknown>): string {
    const parts = Object.entries(args).map(([k, v]) => {
      const str = typeof v === 'string' ? v : JSON.stringify(v);
      const truncated = str.length > 60 ? str.slice(0, 57) + '...' : str;
      return `${k}=${JSON.stringify(truncated)}`;
    });
    return parts.join(', ');
  }
}
