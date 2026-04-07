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
// ─── System prompt ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are IntelliCode, an expert AI software engineer running in a terminal (PowerShell or bash).
Your primary mission is to produce HIGH-QUALITY, production-ready code that meets professional engineering standards.

Core principles for code generation:
- Write clean, readable, well-structured code that follows language idioms and best practices.
- Always include comprehensive error handling: validate inputs, handle edge cases, and provide informative error messages.
- Add concise but meaningful documentation: JSDoc/docstrings for public functions, inline comments for non-obvious logic.
- Think about architecture first — choose appropriate design patterns, separate concerns, and keep components cohesive and loosely coupled.
- Write code that is testable by design: pure functions where possible, dependency injection, avoid global mutable state.
- Prefer explicit over implicit, and clarity over cleverness.
- When modifying existing code, preserve the existing code style and conventions.

Task-solving approach:
- Always reason step-by-step before taking actions. Briefly describe your plan.
- Use the available tools to explore the file system, read source code, and execute commands.
- When writing or modifying files, show a short summary of changes made.
- When running commands, interpret their output and take corrective action if needed.
- Be concise but thorough. Avoid unnecessary repetition.
- Never ask the user for permission to call a tool — just do it, then explain.
- If a task requires multiple steps, complete all of them before reporting back.
- Prefer targeted edits over rewriting entire files when fixing bugs.

Memory:
- You have access to a memory_store tool to remember important user preferences, project conventions, or facts for future sessions.
- When a user mentions a preference, convention, or important context that should persist, store it immediately.
- Do not store trivial or temporary information — only things that will genuinely improve future interactions.

MCP (Model Context Protocol) Integration:
- You have access to MCP tools that extend your capabilities (prefixed with mcp__).
- If a user's goal requires a capability you don't have (e.g. fetching weather, browsing the web,
  querying a database), you can install and configure a new MCP server autonomously.
- To install an MCP server: use execute_command to run "npm install -g <package>" (or npx),
  then call mcp_configure with the server details to register and start it immediately.
- Common MCP packages: @modelcontextprotocol/server-brave-search (web search),
  @modelcontextprotocol/server-filesystem (enhanced FS), @modelcontextprotocol/server-github (GitHub API).
- After calling mcp_configure, the new tools will be available in your next turn.

Penpot MCP Integration (UI/UX Design → Code workflow):
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
            // Honour cancellation between iterations (e.g. during tool execution)
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
            // 'high' uses temperature=0 for deterministic, focused reasoning (more tokens to think deeper)
            case 'high': return { temperature: 0, maxTokens: 8192 };
            case 'low': return { temperature: 0.3, maxTokens: 2048 };
            // 'off' skips deep reasoning — fast, conversational responses
            case 'off': return { temperature: 0.7, maxTokens: 1024 };
            default: return { temperature: 0.1, maxTokens: 4096 };
        }
    }
    /** Return a human-readable description of the current think level settings. */
    getThinkLevelDescription() {
        switch (this.thinkLevel) {
            case 'high': return 'high   (temperature=0.0, max_tokens=8192)';
            case 'low': return 'low    (temperature=0.3, max_tokens=2048)';
            case 'off': return 'off    (disabled — fast responses, temperature=0.7, max_tokens=1024)';
            default: return 'medium (temperature=0.1, max_tokens=4096)';
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
                const serverConfig = {
                    name: serverName.trim(),
                    command: serverCommand.trim(),
                    args: args['args'] ?? [],
                    env: args['env'] ?? {},
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