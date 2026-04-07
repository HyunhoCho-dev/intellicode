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
const SYSTEM_PROMPT = `You are IntelliCode, an expert AI coding agent running in a terminal (PowerShell or bash).
You help developers with any coding task: reading/writing files, running tests, debugging, refactoring, and more.

Guidelines:
- Always reason step-by-step before taking actions. Briefly describe your plan.
- Use the available tools to explore the file system, read source code, and execute commands.
- When writing or modifying files, show a short summary of changes made.
- When running commands, interpret their output and take corrective action if needed.
- Be concise but thorough. Avoid unnecessary repetition.
- Never ask the user for permission to call a tool — just do it, then explain.
- If a task requires multiple steps, complete all of them before reporting back.
- Prefer targeted edits over rewriting entire files when fixing bugs.`;
// ─── Planner class ────────────────────────────────────────────────────────────
class Planner {
    constructor(mcpManager) {
        this.history = [];
        this.tools = [...fs_1.fsTools, ...shell_1.shellTools];
        this.mcpManager = mcpManager;
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
     */
    async run(userMessage, onToken) {
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
            const messages = this.buildMessages();
            let streamStarted = false;
            const response = await (0, github_copilot_1.streamChatCompletion)(messages, toolDefs, (chunk) => {
                if (!streamStarted) {
                    streamStarted = true;
                }
                onToken(chunk);
            });
            if (response.tool_calls.length > 0) {
                // LLM wants to call tools
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
    /** Assemble the full message array including the system prompt. */
    buildMessages() {
        return [
            { role: 'system', content: SYSTEM_PROMPT },
            ...this.history,
        ];
    }
    /** Build tool definitions from built-in tools + MCP tools. */
    buildToolDefinitions() {
        const builtIn = this.tools.map((t) => ({
            type: 'function',
            function: {
                name: t.name,
                description: t.description,
                parameters: t.parameters,
            },
        }));
        const mcpDefs = this.mcpManager.getToolDefinitions();
        return [...builtIn, ...mcpDefs];
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