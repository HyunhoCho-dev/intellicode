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
import { McpManager } from '../mcp/manager';
export type ThinkLevel = 'low' | 'medium' | 'high';
export declare class Planner {
    private history;
    private tools;
    private mcpManager;
    private model;
    private thinkLevel;
    constructor(mcpManager: McpManager, model?: string, thinkLevel?: ThinkLevel);
    /** Set the model to use for completions. */
    setModel(model: string): void;
    /** Get the current model. */
    getModel(): string;
    /** Set the thinking intensity level. */
    setThinkLevel(level: ThinkLevel): void;
    /** Get the current thinking level. */
    getThinkLevel(): ThinkLevel;
    /** Clear conversation history. */
    resetHistory(): void;
    /** Return current conversation history length. */
    get historyLength(): number;
    /**
     * Process a user message: run the full agentic loop and stream the response.
     *
     * @param userMessage  The user's input.
     * @param onToken      Callback for streaming text tokens.
     */
    run(userMessage: string, onToken: (token: string) => void): Promise<void>;
    /** Map think level to LLM sampling parameters. */
    private getThinkParams;
    /** Return a human-readable description of the current think level settings. */
    getThinkLevelDescription(): string;
    /** Assemble the full message array including the system prompt. */
    private buildMessages;
    /** Build tool definitions from built-in tools + MCP tools + mcp_configure. */
    private buildToolDefinitions;
    /**
     * Execute a single tool call and return its result as a string.
     * Also streams a status line so the user can see what is happening.
     */
    private executeToolCall;
    /** Format tool arguments for display (truncate long values). */
    private formatArgs;
}
//# sourceMappingURL=planner.d.ts.map