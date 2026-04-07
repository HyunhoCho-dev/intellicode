/**
 * GitHub Copilot provider
 *
 * Implements:
 *  1. OAuth 2.0 Device Flow to obtain a GitHub access token.
 *  2. Copilot-internal session token retrieval (gho_ token).
 *  3. Chat completions API calls with streaming support.
 */
export interface Message {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | null;
    tool_call_id?: string;
    tool_calls?: ToolCall[];
    name?: string;
}
export interface ToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
}
export interface ToolDefinition {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    };
}
export interface ChatCompletionChunk {
    choices: Array<{
        delta: {
            content?: string;
            tool_calls?: Array<{
                index: number;
                id?: string;
                type?: string;
                function?: {
                    name?: string;
                    arguments?: string;
                };
            }>;
        };
        finish_reason: string | null;
    }>;
}
export interface ChatCompletionResponse {
    content: string;
    tool_calls: ToolCall[];
}
/** Public function: runs the full Device Flow and saves the token. */
export declare function loginWithDeviceFlow(): Promise<void>;
export declare function isLoggedIn(): boolean;
export declare function logout(): void;
/**
 * Stream a chat completion from the Copilot API.
 *
 * @param messages   Conversation history.
 * @param tools      Optional tool definitions (OpenAI function-calling format).
 * @param onChunk    Called with each text chunk as it arrives.
 * @param model      Model ID to use (default: 'gpt-4o').
 * @param temperature Sampling temperature (default: 0.1).
 * @param maxTokens  Maximum tokens in the response (default: 4096).
 * @returns          Full assembled response (content + tool_calls).
 */
export declare function streamChatCompletion(messages: Message[], tools: ToolDefinition[], onChunk: (chunk: string) => void, model?: string, temperature?: number, maxTokens?: number): Promise<ChatCompletionResponse>;
/** Fetch available Copilot models (for diagnostics / future use). */
export declare function listModels(): Promise<string[]>;
/** Return the path to the config file (used for diagnostic output). */
export declare function getConfigPath(): string;
/** Persist the user's preferred model and think level. */
export declare function saveModelSettings(model: string, thinkLevel: string): void;
/** Load the user's preferred model and think level. */
export declare function loadModelSettings(): {
    model: string;
    thinkLevel: string;
};
/** Return whether there is a cached (possibly expired) Copilot token. */
export declare function authStatus(): {
    loggedIn: boolean;
    tokenExpiry?: Date;
};
//# sourceMappingURL=github-copilot.d.ts.map