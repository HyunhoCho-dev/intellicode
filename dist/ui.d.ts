/**
 * IntelliCode UI — modern terminal design utilities
 *
 * All visual output (banner, spinner, boxes, status, help) lives here
 * so that index.ts and planner.ts stay focused on logic.
 *
 * Color palette  : sky-blue / cyan as the primary brand accent
 * Box style       : rounded corners (╭ ╮ ╰ ╯) with thin lines
 * Width           : 76 columns outer / 74 columns inner content
 */
export declare const C: {
    readonly cyan: "\u001B[96m";
    readonly cyanD: "\u001B[36m";
    readonly blue: "\u001B[94m";
    readonly white: "\u001B[97m";
    readonly gray: "\u001B[90m";
    readonly green: "\u001B[32m";
    readonly greenB: "\u001B[92m";
    readonly red: "\u001B[31m";
    readonly yellow: "\u001B[33m";
    readonly magenta: "\u001B[95m";
    readonly bold: "\u001B[1m";
    readonly dim: "\u001B[2m";
    readonly reset: "\u001B[0m";
};
/**
 * Print the full IntelliCode startup banner to stdout.
 * @param version  package version string, e.g. "0.1.0"
 */
export declare function printBanner(version: string): void;
/** Hints panel shown right after the banner in interactive mode. */
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
 * Returns a stop function that clears the spinner line.
 */
export declare function createExecutingSpinner(): () => void;
/**
 * Create an animated installing spinner (for skill/package installs).
 * Returns a stop function.
 */
export declare function createInstallingSpinner(label?: string): () => void;
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
    skills: string[];
}
/** Print a bordered status box to stdout. */
export declare function printStatus(info: StatusInfo): void;
/** Print the full REPL help, organized into bordered sections. */
export declare function printHelp(): void;
import type { SmitheryServer, InstalledSkill } from './skills/manager';
/**
 * Print a numbered list of Smithery search results.
 * @param results  Array of Smithery server records.
 * @param title    Section title shown in the box header.
 */
export declare function printSkillsSearch(results: SmitheryServer[], title?: string): void;
/**
 * Print the list of currently installed skills.
 * @param skills  Array of InstalledSkill records.
 */
export declare function printInstalledSkills(skills: InstalledSkill[]): void;
//# sourceMappingURL=ui.d.ts.map