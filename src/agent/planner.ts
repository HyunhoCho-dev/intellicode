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

// ─── Types ────────────────────────────────────────────────────────────────────

export type ThinkLevel = 'low' | 'medium' | 'high';

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
- Prefer targeted edits over rewriting entire files when fixing bugs.

MCP (Model Context Protocol) Integration:
- You have access to MCP tools that extend your capabilities (prefixed with mcp__).
- If a user's goal requires a capability you don't have (e.g. fetching weather, browsing the web,
  querying a database), you can install and configure a new MCP server autonomously.
- To install an MCP server: use execute_command to run "npm install -g <package>" (or npx),
  then call mcp_configure with the server details to register and start it immediately.
- Common MCP packages: @modelcontextprotocol/server-brave-search (web search),
  @modelcontextprotocol/server-filesystem (enhanced FS), @modelcontextprotocol/server-github (GitHub API).
- After calling mcp_configure, the new tools will be available in your next turn.`;

// ─── Planner class ────────────────────────────────────────────────────────────

type AnyTool = FsTool | ShellTool;

// ─── Planner class ────────────────────────────────────────────────────────────

export class Planner {
  private history: Message[] = [];
  private tools: AnyTool[] = [...fsTools, ...shellTools];
  private mcpManager: McpManager;
  private model: string = 'gpt-4o';
  private thinkLevel: ThinkLevel = 'medium';

  constructor(mcpManager: McpManager, model?: string, thinkLevel?: ThinkLevel) {
    this.mcpManager = mcpManager;
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
   */
  async run(
    userMessage: string,
    onToken: (token: string) => void
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
      );

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

  /** Map think level to LLM sampling parameters. */
  private getThinkParams(): { temperature: number; maxTokens: number } {
    switch (this.thinkLevel) {
      // 'high' uses temperature=0 for deterministic, focused reasoning (more tokens to think deeper)
      case 'high':   return { temperature: 0,   maxTokens: 8192 };
      case 'low':    return { temperature: 0.3, maxTokens: 2048 };
      default:       return { temperature: 0.1, maxTokens: 4096 };
    }
  }

  /** Return a human-readable description of the current think level settings. */
  getThinkLevelDescription(): string {
    switch (this.thinkLevel) {
      case 'high':   return 'high   (temperature=0.0, max_tokens=8192)';
      case 'low':    return 'low    (temperature=0.3, max_tokens=2048)';
      default:       return 'medium (temperature=0.1, max_tokens=4096)';
    }
  }

  /** Assemble the full message array including the system prompt. */
  private buildMessages(): Message[] {
    return [
      { role: 'system', content: SYSTEM_PROMPT },
      ...this.history,
    ];
  }

  /** Build tool definitions from built-in tools + MCP tools + mcp_configure. */
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

    const mcpDefs = this.mcpManager.getToolDefinitions();
    return [...builtIn, mcpConfigureTool, ...mcpDefs];
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
        const serverConfig = {
          name: serverName.trim(),
          command: serverCommand.trim(),
          args: (args['args'] as string[] | undefined) ?? [],
          env: (args['env'] as Record<string, string> | undefined) ?? {},
        };
        await this.mcpManager.installAndStartServer(serverConfig);
        return `MCP server "${serverConfig.name}" configured and started. Its tools are now available.`;
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
