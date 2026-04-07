"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.Planner = void 0;
const github_copilot_1 = require("../providers/github-copilot");
const fs_1 = require("../tools/fs");
const shell_1 = require("../tools/shell");
// ─── Execution spinner ────────────────────────────────────────────────────────
const EXEC_SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
/**
 * Show a sky-blue animated spinner on stdout while a tool call is executing.
 * Returns a `stop()` function that clears the spinner line when called.
 */
function startExecutingSpinner() {
    let idx = 0;
    process.stdout.write(`\x1b[96m${EXEC_SPINNER_FRAMES[0]} Executing…\x1b[0m`);
    const interval = setInterval(() => {
        idx = (idx + 1) % EXEC_SPINNER_FRAMES.length;
        process.stdout.write(`\r\x1b[96m${EXEC_SPINNER_FRAMES[idx]} Executing…\x1b[0m`);
    }, 100);
    return () => {
        clearInterval(interval);
        process.stdout.write('\r\x1b[2K');
    };
}
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
  Penpot MCP Integration (UI/UX Design → Code workflow)
════════════════════════════════════════════════════════════════════

- Penpot is an open-source design tool. Its MCP server lets you create and manipulate designs programmatically.
- When the user asks for UI/UX design, front-end components, or visual mockups, use the Penpot MCP server.
- If the Penpot MCP server is not yet running, install and configure it autonomously:
    1. Call mcp_configure with: name="penpot", command="npx", args=["-y", "@penpot/mcp"],
       env={"PENPOT_ACCESS_TOKEN": "<token>", "PENPOT_BASE_URL": "https://design.penpot.app"}
    2. Ask the user for their Penpot access token if not already stored in memory.
    3. Once configured, use mcp__penpot__* tools to create frames, shapes, and design components.
- Penpot design → code workflow:
    a. Use Penpot MCP tools to create the design (frames, components, colors, typography).
    b. Retrieve the design structure (layers, dimensions, styles) from Penpot.
    c. Use that structure as the definitive specification to generate clean, pixel-perfect code
       (React, Vue, HTML/CSS, etc.) that exactly matches the design.
- Always generate code that faithfully implements the Penpot design — use the exact colors, spacing,
  font sizes, and layout from the design file rather than guessing.`;
// ─── Planner class ────────────────────────────────────────────────────────────
class Planner {
    constructor(mcpManager, memoryManager, model, thinkLevel) {
        this.history = [];
        this.tools = [...fs_1.fsTools, ...shell_1.shellTools];
        this.model = 'gpt-4o';
        this.thinkLevel = 'medium';
        this.mcpManager = mcpManager;
        this.memoryManager = memoryManager;
        if (model)
            this.model = model;
        if (thinkLevel)
            this.thinkLevel = thinkLevel;
    }
    /** Set the model to use for completions. */
    setModel(model) {
        this.model = model;
    }
    /** Get the current model. */
    getModel() {
        return this.model;
    }
    /** Set the thinking intensity level. */
    setThinkLevel(level) {
        this.thinkLevel = level;
    }
    /** Get the current thinking level. */
    getThinkLevel() {
        return this.thinkLevel;
    }
    /** Clear conversation history. */
    resetHistory() {
        this.history = [];
    }
    /** Return current conversation history length. */
    get historyLength() {
        return this.history.length;
    }
    /**
     * Process a user message: run the full agentic loop and stream the response.
     *
     * @param userMessage  The user's input.
     * @param onToken      Callback for streaming text tokens.
     * @param signal       Optional AbortSignal to interrupt the response mid-stream.
     */
    async run(userMessage, onToken, signal) {
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
            if (signal?.aborted)
                break;
            const messages = this.buildMessages();
            let streamStarted = false;
            const { temperature, maxTokens } = this.getThinkParams();
            const response = await (0, github_copilot_1.streamChatCompletion)(messages, toolDefs, (chunk) => {
                if (!streamStarted) {
                    streamStarted = true;
                }
                onToken(chunk);
            }, this.model, temperature, maxTokens, signal);
            if (response.tool_calls.length > 0) {
                // LLM wants to call tools — but only if we haven't been asked to stop
                if (signal?.aborted)
                    break;
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
    getThinkParams() {
        switch (this.thinkLevel) {
            // 'high' uses temperature=0 for deterministic, careful reasoning with maximum tokens
            // for complex coding tasks that benefit from deep, step-by-step analysis
            case 'high': return { temperature: 0, maxTokens: 16384 };
            case 'low': return { temperature: 0.3, maxTokens: 2048 };
            // 'off' skips deep reasoning — fast, conversational responses
            case 'off': return { temperature: 0.7, maxTokens: 1024 };
            // 'medium' (default) — balanced for most coding tasks; temperature near-zero
            // for correctness while allowing enough tokens for well-documented output
            default: return { temperature: 0.1, maxTokens: 8192 };
        }
    }
    /** Return a human-readable description of the current think level settings. */
    getThinkLevelDescription() {
        switch (this.thinkLevel) {
            case 'high': return 'high   (temperature=0.0, max_tokens=16384)';
            case 'low': return 'low    (temperature=0.3, max_tokens=2048)';
            case 'off': return 'off    (disabled — fast responses, temperature=0.7, max_tokens=1024)';
            default: return 'medium (temperature=0.1, max_tokens=8192)';
        }
    }
    /** Assemble the full message array including the system prompt. */
    buildMessages() {
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
    buildToolDefinitions() {
        const builtIn = this.tools.map((t) => ({
            type: 'function',
            function: {
                name: t.name,
                description: t.description,
                parameters: t.parameters,
            },
        }));
        // Special tool: let the agent install + register new MCP servers at runtime
        const mcpConfigureTool = {
            type: 'function',
            function: {
                name: 'mcp_configure',
                description: 'Register and start a new MCP (Model Context Protocol) server so its tools become available immediately. ' +
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
        const memoryStoreTool = {
            type: 'function',
            function: {
                name: 'memory_store',
                description: 'Store a key-value pair in long-term memory so it is recalled in future sessions. ' +
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
        const mcpDefs = this.mcpManager.getToolDefinitions();
        return [...builtIn, mcpConfigureTool, memoryStoreTool, ...mcpDefs];
    }
    /**
     * Execute a single tool call and return its result as a string.
     * Also streams a status line so the user can see what is happening.
     */
    async executeToolCall(toolCall, onToken) {
        const { name, arguments: argsJson } = toolCall.function;
        let args = {};
        try {
            args = JSON.parse(argsJson);
        }
        catch {
            return `Error: Could not parse tool arguments: ${argsJson}`;
        }
        // Show a status indicator to the user
        onToken(`\n\x1b[90m⚙  ${name}(${this.formatArgs(args)})\x1b[0m\n`);
        // Start a sky-blue spinner while the tool is executing
        const stopSpinner = startExecutingSpinner();
        try {
            // Handle mcp_configure: install + start a new MCP server at runtime
            if (name === 'mcp_configure') {
                const serverName = args['name'];
                const serverCommand = args['command'];
                if (!serverName || typeof serverName !== 'string' || !serverName.trim()) {
                    return 'Error: mcp_configure requires a non-empty "name" field.';
                }
                if (!serverCommand || typeof serverCommand !== 'string' || !serverCommand.trim()) {
                    return 'Error: mcp_configure requires a non-empty "command" field.';
                }
                const configuredEnv = args['env'] ?? {};
                // ── Penpot-specific pre-flight setup ──────────────────────────────
                if (serverName.trim().toLowerCase() === 'penpot') {
                    // 1. Ensure pnpm is installed (Penpot MCP requires it internally).
                    //    executeCommand routes through the OS shell (PowerShell on Windows,
                    //    bash on Unix), which resolves .cmd wrappers automatically, so we
                    //    do not need to append ".cmd" manually here.
                    const pnpmCheck = await (0, shell_1.executeCommand)('pnpm --version');
                    if (pnpmCheck.exitCode !== 0) {
                        onToken('\x1b[96m⚙  pnpm not found — installing globally via npm…\x1b[0m\n');
                        const installResult = await (0, shell_1.executeCommand)('npm install -g pnpm');
                        if (installResult.exitCode !== 0) {
                            return (`Failed to install pnpm (required for Penpot MCP):\n` +
                                (installResult.stderr || installResult.stdout));
                        }
                    }
                    // 2. Inject PENPOT_ACCESS_TOKEN from memory if not already supplied
                    if (!configuredEnv['PENPOT_ACCESS_TOKEN']) {
                        const storedToken = this.memoryManager.get('penpot_access_token');
                        if (storedToken) {
                            configuredEnv['PENPOT_ACCESS_TOKEN'] = storedToken;
                        }
                    }
                }
                // ─────────────────────────────────────────────────────────────────
                const serverConfig = {
                    name: serverName.trim(),
                    command: serverCommand.trim(),
                    args: args['args'] ?? [],
                    env: configuredEnv,
                };
                await this.mcpManager.installAndStartServer(serverConfig);
                return `MCP server "${serverConfig.name}" configured and started. Its tools are now available.`;
            }
            // Handle memory_store: persist a key-value pair for future sessions
            if (name === 'memory_store') {
                const memKey = args['key'];
                const memValue = args['value'];
                if (!memKey?.trim()) {
                    return 'Error: memory_store requires a non-empty "key" field.';
                }
                if (!memValue || typeof memValue !== 'string') {
                    return 'Error: memory_store requires a "value" field.';
                }
                this.memoryManager.set(memKey.trim(), memValue);
                return `Memory stored: "${memKey.trim()}" = "${memValue}"`;
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
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return `Error executing "${name}": ${msg}`;
        }
        finally {
            stopSpinner();
        }
    }
    /** Format tool arguments for display (truncate long values). */
    formatArgs(args) {
        const parts = Object.entries(args).map(([k, v]) => {
            const str = typeof v === 'string' ? v : JSON.stringify(v);
            const truncated = str.length > 60 ? str.slice(0, 57) + '...' : str;
            return `${k}=${JSON.stringify(truncated)}`;
        });
        return parts.join(', ');
    }
}
exports.Planner = Planner;
//# sourceMappingURL=planner.js.map