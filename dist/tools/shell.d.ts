/**
 * Shell execution tools
 *
 * Allows the agent to run shell commands and capture stdout/stderr.
 * Defaults to PowerShell on Windows and bash on Unix-like systems.
 */
export interface ShellTool {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    execute: (args: Record<string, unknown>) => Promise<string>;
}
export interface CommandResult {
    stdout: string;
    stderr: string;
    exitCode: number;
    timedOut: boolean;
}
/**
 * Execute a shell command and return its output.
 *
 * @param command   Shell command to execute.
 * @param cwd       Working directory (defaults to process.cwd()).
 * @param timeout   Timeout in milliseconds (default: 30 s).
 */
export declare function executeCommand(command: string, cwd?: string, timeout?: number): Promise<CommandResult>;
/** Format a CommandResult as a string for the LLM. */
export declare function formatResult(result: CommandResult): string;
export declare const shellTools: ShellTool[];
//# sourceMappingURL=shell.d.ts.map