/**
 * IntelliCode UI — modern terminal design utilities
 *
 * All visual output (banner, spinner, boxes, status, help) lives here
 * so that index.ts and planner.ts stay focused on logic.
 *
 * Color palette  : sky-blue / cyan as the primary brand accent
 * Box style       : rounded corners (╭ ╮ ╰ ╯) with thin lines
 * Width           : 62 columns outer / 58 columns inner content
 */
export declare const C: {
    readonly cyan: "\u001B[96m";
    readonly cyanD: "\u001B[36m";
    readonly white: "\u001B[97m";
    readonly gray: "\u001B[90m";
    readonly green: "\u001B[32m";
    readonly red: "\u001B[31m";
    readonly yellow: "\u001B[33m";
    readonly bold: "\u001B[1m";
    readonly reset: "\u001B[0m";
};
/**
 * Print the full IntelliCode startup banner to stdout.
 * @param version  package version string, e.g. "0.1.0"
 */
export declare function printBanner(version: string): void;
/** One-line hints shown right after the banner in interactive mode. */
export declare function printWelcome(): void;
/**
 * Create an animated thinking spinner.
 * Returns a `stop()` function that clears the spinner line.
 */
export declare function createThinkingSpinner(): {
    stop: () => void;
};
/**
 * Create an animated executing spinner (for tool calls).
 * Returns a `stop()` function that clears the spinner line.
 */
export declare function createExecutingSpinner(): () => void;
/**
 * The readline prompt string.
 * Renders as:  ❯  intellicode  ›
 */
export declare const PROMPT: string;
export interface StatusInfo {
    model: string;
    thinkLevel: string;
    memories: number;
    history: number;
    mcpServers: string[];
}
/** Print a bordered status box to stdout. */
export declare function printStatus(info: StatusInfo): void;
/** Print the full REPL help, organized into bordered sections. */
export declare function printHelp(): void;
//# sourceMappingURL=ui.d.ts.map