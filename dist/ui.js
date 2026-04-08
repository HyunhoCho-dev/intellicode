"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROMPT = exports.C = void 0;
exports.printBanner = printBanner;
exports.printWelcome = printWelcome;
exports.createThinkingSpinner = createThinkingSpinner;
exports.createExecutingSpinner = createExecutingSpinner;
exports.printStatus = printStatus;
exports.printHelp = printHelp;
exports.printSkillsSearch = printSkillsSearch;
exports.printInstalledSkills = printInstalledSkills;
// ─── ANSI palette ──────────────────────────────────────────────────────────────
exports.C = {
    cyan: '\x1b[96m', // bright cyan    — primary brand
    cyanD: '\x1b[36m', // dim cyan       — accents
    blue: '\x1b[94m', // bright blue    — highlights
    white: '\x1b[97m', // bright white   — main text
    gray: '\x1b[90m', // dark gray      — secondary / hints
    green: '\x1b[32m', // green          — success
    greenB: '\x1b[92m', // bright green   — strong success
    red: '\x1b[31m', // red            — errors
    yellow: '\x1b[33m', // yellow         — warnings
    magenta: '\x1b[95m', // bright magenta — skills accent
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    reset: '\x1b[0m',
};
// ─── Box drawing ───────────────────────────────────────────────────────────────
const BOX_OUTER = 76; // total columns including the two │ chars
const BOX_INNER = BOX_OUTER - 2; // 74 — chars between │ and │
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
    // inner layout: 1 space + content + padding + 1 space  =  BOX_INNER (70)
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
    const subText = `  AI Coding Agent  ·  GitHub Copilot  ·  Smithery Skills  ·  v`;
    const verText = `${exports.C.cyan}${version}${exports.C.reset}`;
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
    const skills = info.skills.length > 0
        ? info.skills.map((s) => `${exports.C.magenta}${s}${exports.C.reset}`).join(', ')
        : `${exports.C.gray}(none)${exports.C.reset}`;
    process.stdout.write('\n');
    console.log(`  ${boxTop('Status')}`);
    console.log(`  ${statusRow('Model', `${exports.C.cyan}${info.model}${exports.C.reset}`)}`);
    console.log(`  ${statusRow('Think', `${exports.C.cyan}${info.thinkLevel}${exports.C.reset}`)}`);
    console.log(`  ${statusRow('Memory', `${info.memories} stored`)}`);
    console.log(`  ${statusRow('History', `${info.history} messages`)}`);
    console.log(`  ${statusRow('MCP Servers', mcp)}`);
    console.log(`  ${statusRow('Skills', skills)}`);
    console.log(`  ${boxBottom()}`);
    process.stdout.write('\n');
}
// ─── /help ─────────────────────────────────────────────────────────────────────
/** Print the full REPL help, organized into bordered sections. */
function printHelp() {
    const cmd = (c) => `${exports.C.cyan}${c}${exports.C.reset}`;
    const note = (n) => `${exports.C.gray}${n}${exports.C.reset}`;
    /** Two-column command row:  cmd (22 wide)  description */
    const row = (c, d) => {
        const fmtC = padTo(cmd(c), 22);
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
    console.log(`  ${boxLine(`  ${note('The')} ${cmd('⠋ Thinking…')} ${note('spinner is shown while the model generates')}`)}`);
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
    // ── Skills (Smithery) ──
    console.log(`  ${boxTop('Skills  ·  Smithery Ecosystem')}`);
    console.log(`  ${row('/skills list', 'Show installed skills')}`);
    console.log(`  ${row('/skills search <q>', 'Search Smithery registry for skills')}`);
    console.log(`  ${row('/skills popular', 'Browse top skills from Smithery')}`);
    console.log(`  ${row('/skills add <id> [nm]', 'Install a skill from Smithery')}`);
    console.log(`  ${row('/skills remove <name>', 'Uninstall a skill')}`);
    console.log(`  ${row('/skills create <name>', 'Scaffold a new skill interactively')}`);
    console.log(`  ${boxBottom()}`);
    process.stdout.write('\n');
    // ── MCP Servers ──
    console.log(`  ${boxTop('MCP Servers')}`);
    console.log(`  ${row('/mcp list', 'List configured MCP servers')}`);
    console.log(`  ${row('/mcp install <pkg>', 'Install and register an MCP package')}`);
    console.log(`  ${boxBottom()}`);
    process.stdout.write('\n');
    // ── Maintenance ──
    console.log(`  ${boxTop('Maintenance')}`);
    console.log(`  ${row('/update', 'Pull latest changes and rebuild')}`);
    console.log(`  ${row('/status', 'Show model, think level, memory, MCP & skills')}`);
    console.log(`  ${row('/help', 'Show this help message')}`);
    console.log(`  ${boxBottom()}`);
    process.stdout.write('\n');
}
/**
 * Print a numbered list of Smithery search results.
 * @param results  Array of Smithery server records.
 * @param title    Section title shown in the box header.
 */
function printSkillsSearch(results, title = 'Smithery Skills') {
    if (results.length === 0) {
        console.log(`${exports.C.gray}  ◦ No skills found.${exports.C.reset}\n`);
        return;
    }
    process.stdout.write('\n');
    console.log(`  ${boxTop(title)}`);
    results.forEach((s, i) => {
        const num = `${exports.C.cyan}${String(i + 1).padStart(2, ' ')}${exports.C.reset}`;
        const name = `${exports.C.bold}${exports.C.cyan}${s.qualifiedName}${exports.C.reset}`;
        const badge = s.isVerified ? ` ${exports.C.green}✓${exports.C.reset}` : '';
        const uses = s.useCount !== undefined
            ? ` ${exports.C.gray}· ${s.useCount.toLocaleString()} uses${exports.C.reset}`
            : '';
        const desc = s.description
            ? s.description.length > 48
                ? s.description.slice(0, 45) + '…'
                : s.description
            : '';
        console.log(`  ${boxLine(`  ${num}  ${name}${badge}${uses}`)}`);
        if (desc) {
            console.log(`  ${boxLine(`       ${exports.C.gray}${desc}${exports.C.reset}`)}`);
        }
    });
    console.log(`  ${boxBottom()}`);
    process.stdout.write('\n');
}
/**
 * Print the list of currently installed skills.
 * @param skills  Array of InstalledSkill records.
 */
function printInstalledSkills(skills) {
    if (skills.length === 0) {
        console.log(`${exports.C.gray}  ◦ No skills installed. Use ${exports.C.reset}/skills search <query>${exports.C.gray} to discover skills.${exports.C.reset}\n`);
        return;
    }
    process.stdout.write('\n');
    console.log(`  ${boxTop('Installed Skills')}`);
    for (const s of skills) {
        const name = `${exports.C.magenta}${s.name}${exports.C.reset}`;
        const qn = `${exports.C.gray}${s.qualifiedName}${exports.C.reset}`;
        const desc = s.description
            ? `  ${exports.C.gray}${s.description.length > 40 ? s.description.slice(0, 37) + '…' : s.description}${exports.C.reset}`
            : '';
        console.log(`  ${boxLine(`  ${name}  ${qn}${desc}`)}`);
    }
    console.log(`  ${boxBottom()}`);
    process.stdout.write('\n');
}
//# sourceMappingURL=ui.js.map