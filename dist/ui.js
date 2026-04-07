"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROMPT = exports.C = void 0;
exports.printBanner = printBanner;
exports.printWelcome = printWelcome;
exports.createThinkingSpinner = createThinkingSpinner;
exports.createExecutingSpinner = createExecutingSpinner;
exports.printStatus = printStatus;
exports.printHelp = printHelp;
// ─── ANSI palette ──────────────────────────────────────────────────────────────
exports.C = {
    cyan: '\x1b[96m', // bright cyan  — primary brand
    cyanD: '\x1b[36m', // dim cyan     — accents
    white: '\x1b[97m', // bright white — main text
    gray: '\x1b[90m', // dark gray    — secondary / hints
    green: '\x1b[32m', // green        — success
    red: '\x1b[31m', // red          — errors
    yellow: '\x1b[33m', // yellow       — warnings
    bold: '\x1b[1m',
    reset: '\x1b[0m',
};
// ─── Box drawing ───────────────────────────────────────────────────────────────
const BOX_OUTER = 72; // total columns including the two │ chars
const BOX_INNER = BOX_OUTER - 2; // 70 — chars between │ and │
/** Strip ANSI escape codes to obtain the printable (visible) length. */
function visLen(s) {
    return s.replace(/\x1b\[[0-9;]*m/g, '').length;
}
/** Pad a string with trailing spaces so its visible width equals `width`. */
function padTo(s, width) {
    const extra = width - visLen(s);
    return extra > 0 ? s + ' '.repeat(extra) : s;
}
/** A single box content row: │ ‹space› content ‹padding› ‹space› │  */
function boxLine(content = '') {
    // inner layout: 1 space + content + padding + 1 space  =  BOX_INNER (60)
    const padded = padTo(content, BOX_INNER - 2);
    return `${exports.C.cyan}│${exports.C.reset} ${padded} ${exports.C.cyan}│${exports.C.reset}`;
}
/** Top border: ╭─…─╮  (optionally with a centred label). */
function boxTop(label) {
    if (label) {
        const lbl = ` ${label} `;
        const fill = '─'.repeat(BOX_INNER - visLen(lbl));
        return `${exports.C.cyan}╭─${lbl}${fill}╮${exports.C.reset}`;
    }
    return `${exports.C.cyan}╭${'─'.repeat(BOX_INNER)}╮${exports.C.reset}`;
}
/** Bottom border: ╰─…─╯ */
function boxBottom() {
    return `${exports.C.cyan}╰${'─'.repeat(BOX_INNER)}╯${exports.C.reset}`;
}
/** Mid-rule: ├─…─┤ (optionally with a left-aligned label). */
function boxMid(label) {
    if (label) {
        const lbl = ` ${label} `;
        const fill = '─'.repeat(BOX_INNER - visLen(lbl));
        return `${exports.C.cyan}├─${lbl}${fill}┤${exports.C.reset}`;
    }
    return `${exports.C.cyan}├${'─'.repeat(BOX_INNER)}┤${exports.C.reset}`;
}
// ─── Banner ────────────────────────────────────────────────────────────────────
/**
 * Print the full IntelliCode startup banner to stdout.
 * @param version  package version string, e.g. "0.1.0"
 */
function printBanner(version) {
    const logoText = `${exports.C.bold}${exports.C.cyan}I N T E L L I C O D E${exports.C.reset}`;
    const logoLine = `  ${exports.C.cyan}◈${exports.C.reset}  ${logoText}`;
    const subText = `  AI Coding Agent  ·  GitHub Copilot  ·  `;
    const verText = `${exports.C.cyan}v${version}${exports.C.reset}`;
    const subLine = `${exports.C.gray}${subText}${verText}${exports.C.reset}`;
    process.stdout.write('\n');
    console.log(`  ${boxTop()}`);
    console.log(`  ${boxLine()}`);
    console.log(`  ${boxLine(logoLine)}`);
    console.log(`  ${boxLine(subLine)}`);
    console.log(`  ${boxLine()}`);
    console.log(`  ${boxBottom()}`);
    process.stdout.write('\n');
}
// ─── Welcome hint ──────────────────────────────────────────────────────────────
/** One-line hints shown right after the banner in interactive mode. */
function printWelcome() {
    console.log(`  ${exports.C.gray}◦ Type your request and press ${exports.C.reset}Enter` +
        `${exports.C.gray}  ◦ ${exports.C.reset}/help${exports.C.gray} for all commands` +
        `  ◦ ${exports.C.reset}Ctrl+C${exports.C.gray} to stop a response${exports.C.reset}`);
    process.stdout.write('\n');
}
// ─── Spinners ──────────────────────────────────────────────────────────────────
const BRAILLE = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
/**
 * Create an animated thinking spinner.
 * Returns a `stop()` function that clears the spinner line.
 */
function createThinkingSpinner() {
    let idx = 0;
    const frame = () => `\r${exports.C.cyan}${BRAILLE[idx]}${exports.C.reset}  ${exports.C.gray}Thinking…${exports.C.reset}   `;
    process.stdout.write(frame());
    const timer = setInterval(() => {
        idx = (idx + 1) % BRAILLE.length;
        process.stdout.write(frame());
    }, 80);
    return {
        stop: () => {
            clearInterval(timer);
            process.stdout.write('\r\x1b[2K'); // erase line
        },
    };
}
/**
 * Create an animated executing spinner (for tool calls).
 * Returns a `stop()` function that clears the spinner line.
 */
function createExecutingSpinner() {
    let idx = 0;
    const frame = () => `\r${exports.C.cyan}${BRAILLE[idx]}${exports.C.reset}  ${exports.C.gray}Executing…${exports.C.reset}   `;
    process.stdout.write(frame());
    const timer = setInterval(() => {
        idx = (idx + 1) % BRAILLE.length;
        process.stdout.write(frame());
    }, 100);
    return () => {
        clearInterval(timer);
        process.stdout.write('\r\x1b[2K');
    };
}
// ─── Input prompt ──────────────────────────────────────────────────────────────
/**
 * The readline prompt string.
 * Renders as:  ❯  intellicode  ›
 */
exports.PROMPT = `${exports.C.cyan}❯${exports.C.reset}  ${exports.C.bold}${exports.C.cyan}intellicode${exports.C.reset}  ${exports.C.gray}›${exports.C.reset}  `;
// ─── /status box ───────────────────────────────────────────────────────────────
/** Key-value row for the status box — left col is 12 chars wide. */
function statusRow(key, value) {
    const k = padTo(`${exports.C.gray}${key}${exports.C.reset}`, 12);
    return boxLine(`  ${k}  ${value}`);
}
/** Print a bordered status box to stdout. */
function printStatus(info) {
    const mcp = info.mcpServers.length > 0
        ? info.mcpServers.map((s) => `${exports.C.cyan}${s}${exports.C.reset}`).join(', ')
        : `${exports.C.gray}(none)${exports.C.reset}`;
    process.stdout.write('\n');
    console.log(`  ${boxTop('Status')}`);
    console.log(`  ${statusRow('Model', `${exports.C.cyan}${info.model}${exports.C.reset}`)}`);
    console.log(`  ${statusRow('Think', `${exports.C.cyan}${info.thinkLevel}${exports.C.reset}`)}`);
    console.log(`  ${statusRow('Memory', `${info.memories} stored`)}`);
    console.log(`  ${statusRow('History', `${info.history} messages`)}`);
    console.log(`  ${statusRow('MCP Servers', mcp)}`);
    console.log(`  ${boxBottom()}`);
    process.stdout.write('\n');
}
// ─── /help ─────────────────────────────────────────────────────────────────────
/** Print the full REPL help, organized into bordered sections. */
function printHelp() {
    const cmd = (c) => `${exports.C.cyan}${c}${exports.C.reset}`;
    const note = (n) => `${exports.C.gray}${n}${exports.C.reset}`;
    /** Two-column command row:  cmd (20 wide)  description */
    const row = (c, d) => {
        // padTo uses visible length, so just pass the target visible width (20)
        const fmtC = padTo(cmd(c), 20);
        return boxLine(`  ${fmtC}  ${note(d)}`);
    };
    process.stdout.write('\n');
    // ── Conversation ──
    console.log(`  ${boxTop('Conversation')}`);
    console.log(`  ${row('/clear, /reset', 'Clear conversation context')}`);
    console.log(`  ${row('/history', 'Show messages in context')}`);
    console.log(`  ${row('/exit, /quit', 'Quit IntelliCode')}`);
    console.log(`  ${boxBottom()}`);
    process.stdout.write('\n');
    // ── Response control ──
    console.log(`  ${boxTop('Response Control')}`);
    console.log(`  ${row('Ctrl+C', 'Stop the current response mid-stream')}`);
    console.log(`  ${boxLine(`  ${note('A')} ${cmd('⠋ Thinking…')} ${note('spinner is shown while the model generates')}`)}`);
    console.log(`  ${boxBottom()}`);
    process.stdout.write('\n');
    // ── Model & Reasoning ──
    console.log(`  ${boxTop('Model & Reasoning')}`);
    console.log(`  ${row('/models', 'List models and select one interactively')}`);
    console.log(`  ${row('/think [level]', 'Set reasoning intensity')}`);
    console.log(`  ${boxLine(`  ${note('  levels: ')}${cmd('off')} ${note('|')} ${cmd('on')} ${note('|')} ${cmd('low')} ${note('|')} ${cmd('medium')} ${note('(default) |')} ${cmd('high')}`)}`);
    console.log(`  ${boxBottom()}`);
    process.stdout.write('\n');
    // ── Memory ──
    console.log(`  ${boxTop('Memory')}`);
    console.log(`  ${row('/memory list', 'Show all stored memories')}`);
    console.log(`  ${row('/memory set <k> <v>', 'Store a key-value memory')}`);
    console.log(`  ${row('/memory delete <key>', 'Delete a memory by key')}`);
    console.log(`  ${row('/memory clear', 'Clear all memories')}`);
    console.log(`  ${boxBottom()}`);
    process.stdout.write('\n');
    // ── MCP Servers ──
    console.log(`  ${boxTop('MCP Servers')}`);
    console.log(`  ${row('/mcp list', 'List configured MCP servers')}`);
    console.log(`  ${row('/mcp install <pkg>', 'Install and register an MCP package')}`);
    console.log(`  ${boxBottom()}`);
    process.stdout.write('\n');
    // ── Penpot ──
    console.log(`  ${boxTop('Penpot Design')}`);
    console.log(`  ${row('/penpot connect', 'Guided Penpot MCP setup')}`);
    console.log(`  ${row('/penpot status', 'Show Penpot connection status')}`);
    console.log(`  ${row('/penpot help', 'Penpot workflow tips')}`);
    console.log(`  ${boxBottom()}`);
    process.stdout.write('\n');
    // ── Maintenance ──
    console.log(`  ${boxTop('Maintenance')}`);
    console.log(`  ${row('/update', 'Pull latest changes and rebuild')}`);
    console.log(`  ${row('/status', 'Show model, think level, memory & MCP info')}`);
    console.log(`  ${row('/help', 'Show this help message')}`);
    console.log(`  ${boxBottom()}`);
    process.stdout.write('\n');
}
//# sourceMappingURL=ui.js.map