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
exports.createInstallingSpinner = createInstallingSpinner;
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
        const fill = '─'.repeat(Math.max(0, BOX_INNER - visLen(lbl)));
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
        const fill = '─'.repeat(Math.max(0, BOX_INNER - visLen(lbl)));
        return `${exports.C.cyan}├─${lbl}${fill}┤${exports.C.reset}`;
    }
    return `${exports.C.cyan}├${'─'.repeat(BOX_INNER)}┤${exports.C.reset}`;
}
/** Centre a string within `width` visible columns using spaces. */
function centre(s, width) {
    const len = visLen(s);
    if (len >= width)
        return s;
    const pad = width - len;
    const left = Math.floor(pad / 2);
    const right = pad - left;
    return ' '.repeat(left) + s + ' '.repeat(right);
}
// ─── Banner ────────────────────────────────────────────────────────────────────
/**
 * Print the full IntelliCode startup banner to stdout.
 * @param version  package version string, e.g. "0.1.0"
 */
function printBanner(version) {
    // Three-row compact logo — each row fits within BOX_INNER (74) chars
    const logo = [
        `  ${exports.C.bold}${exports.C.cyan} ██╗  ███╗  ████╗ ███╗ ██╗    ██╗    ██╗  ██████╗  ██████╗  ███████╗${exports.C.reset}`,
        `  ${exports.C.bold}${exports.C.cyanD} ██║  █ █║   ██║   █║  ██║    ██║    ██║ ██╔════╝ ██║   ██║ ██╔════╝${exports.C.reset}`,
        `  ${exports.C.bold}${exports.C.cyan} ██║  ██║   ████╗ ███╗ █████╗ ██║    ██║ ██║      ██║   ██║ ██║  ██║${exports.C.reset}`,
        `  ${exports.C.bold}${exports.C.cyanD} ██║  █ █║   ██║   █║  ██║    ██║    ██║ ██║      ██║   ██║ ██║  ██║${exports.C.reset}`,
        `  ${exports.C.bold}${exports.C.cyan} ╚██╗ ███║  ████╝ ███╝ ╚████╗ ███████╗██║ ╚██████╗ ╚██████╔╝ ███████╝${exports.C.reset}`,
    ];
    const tagline = centre(`${exports.C.gray}AI Coding Agent  ${exports.C.cyanD}·${exports.C.gray}  GitHub Copilot  ${exports.C.cyanD}·${exports.C.gray}  Smithery Skills  ${exports.C.cyanD}·${exports.C.gray}  v${exports.C.cyan}${version}${exports.C.reset}`, BOX_INNER - 2);
    process.stdout.write('\n');
    console.log(`  ${boxTop()}`);
    console.log(`  ${boxLine()}`);
    for (const line of logo) {
        // Logo lines are pre-formatted with leading spaces — add side borders directly
        // (they already include their left padding as part of the string).
        const inner = padTo(line, BOX_INNER - 2);
        console.log(`  ${exports.C.cyan}│${exports.C.reset} ${inner} ${exports.C.cyan}│${exports.C.reset}`);
    }
    console.log(`  ${boxLine()}`);
    console.log(`  ${boxLine(tagline)}`);
    console.log(`  ${boxLine()}`);
    console.log(`  ${boxBottom()}`);
    process.stdout.write('\n');
}
// ─── Welcome hint ──────────────────────────────────────────────────────────────
/** Hints panel shown right after the banner in interactive mode. */
function printWelcome() {
    const col = (icon, text, cmd) => `  ${exports.C.cyan}${icon}${exports.C.reset}  ${exports.C.gray}${text}${exports.C.reset}${exports.C.cyan}${cmd}${exports.C.reset}`;
    console.log(col('◈', 'Type your request and press ', 'Enter'));
    console.log(col('◈', 'Commands start with ', '/help'));
    console.log(col('◈', 'Stop a response with ', 'Ctrl+C'));
    process.stdout.write('\n');
}
// ─── Spinners ──────────────────────────────────────────────────────────────────
const BRAILLE = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const DOTS_ALT = ['⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣷'];
/**
 * Create an animated thinking spinner.
 * Returns a `stop()` function that clears the spinner line.
 */
function createThinkingSpinner() {
    let idx = 0;
    const frame = () => `\r  ${exports.C.cyan}${BRAILLE[idx]}${exports.C.reset}  ${exports.C.gray}Thinking…${exports.C.reset}      `;
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
 * Returns a stop function that clears the spinner line.
 */
function createExecutingSpinner() {
    let idx = 0;
    const frame = () => `\r  ${exports.C.magenta}${DOTS_ALT[idx]}${exports.C.reset}  ${exports.C.gray}Executing…${exports.C.reset}     `;
    process.stdout.write(frame());
    const timer = setInterval(() => {
        idx = (idx + 1) % DOTS_ALT.length;
        process.stdout.write(frame());
    }, 100);
    return () => {
        clearInterval(timer);
        process.stdout.write('\r\x1b[2K');
    };
}
/**
 * Create an animated installing spinner (for skill/package installs).
 * Returns a stop function.
 */
function createInstallingSpinner(label = 'Installing…') {
    const frames = ['◐', '◓', '◑', '◒'];
    let idx = 0;
    const frame = () => `\r  ${exports.C.yellow}${frames[idx]}${exports.C.reset}  ${exports.C.gray}${label}${exports.C.reset}     `;
    process.stdout.write(frame());
    const timer = setInterval(() => {
        idx = (idx + 1) % frames.length;
        process.stdout.write(frame());
    }, 120);
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
exports.PROMPT = `\n${exports.C.cyan}╰─❯${exports.C.reset}  ${exports.C.bold}${exports.C.cyan}intellicode${exports.C.reset}  ${exports.C.gray}›${exports.C.reset}  `;
// ─── /status box ───────────────────────────────────────────────────────────────
/** Icon + key label row for the status box. */
function statusRow(icon, key, value) {
    const keyStr = padTo(`${exports.C.gray}${icon}  ${key}${exports.C.reset}`, 20);
    return boxLine(`  ${keyStr}  ${value}`);
}
/** Print a bordered status box to stdout. */
function printStatus(info) {
    const mcp = info.mcpServers.length > 0
        ? info.mcpServers.map((s) => `${exports.C.cyan}${s}${exports.C.reset}`).join(', ')
        : `${exports.C.gray}none${exports.C.reset}`;
    const skills = info.skills.length > 0
        ? info.skills.map((s) => `${exports.C.magenta}${s}${exports.C.reset}`).join(', ')
        : `${exports.C.gray}none${exports.C.reset}`;
    process.stdout.write('\n');
    console.log(`  ${boxTop('◈  Session Status')}`);
    console.log(`  ${boxLine()}`);
    console.log(`  ${statusRow('⬡', 'Model', `${exports.C.cyan}${info.model}${exports.C.reset}`)}`);
    console.log(`  ${statusRow('◎', 'Reasoning', `${exports.C.cyan}${info.thinkLevel}${exports.C.reset}`)}`);
    console.log(`  ${boxLine()}`);
    console.log(`  ${statusRow('◉', 'Memory', `${exports.C.white}${info.memories}${exports.C.gray} stored entries${exports.C.reset}`)}`);
    console.log(`  ${statusRow('◎', 'History', `${exports.C.white}${info.history}${exports.C.gray} messages in context${exports.C.reset}`)}`);
    console.log(`  ${boxLine()}`);
    console.log(`  ${statusRow('⬡', 'MCP Servers', mcp)}`);
    console.log(`  ${statusRow('◈', 'Skills', skills)}`);
    console.log(`  ${boxLine()}`);
    console.log(`  ${boxBottom()}`);
    process.stdout.write('\n');
}
// ─── /help ─────────────────────────────────────────────────────────────────────
/** Print the full REPL help, organized into bordered sections. */
function printHelp() {
    const cmd = (c) => `${exports.C.cyan}${c}${exports.C.reset}`;
    const note = (n) => `${exports.C.gray}${n}${exports.C.reset}`;
    const icon = (i) => `${exports.C.cyan}${i}${exports.C.reset}`;
    /** Two-column command row:  cmd (22 wide)  description */
    const row = (c, d) => {
        const fmtC = padTo(`  ${icon('›')}  ${cmd(c)}`, 30);
        return boxLine(`${fmtC}  ${note(d)}`);
    };
    process.stdout.write('\n');
    // ── Conversation ──
    console.log(`  ${boxTop('◎  Conversation')}`);
    console.log(`  ${row('/clear, /reset', 'Clear conversation context')}`);
    console.log(`  ${row('/history', 'Show number of messages in context')}`);
    console.log(`  ${row('/exit, /quit', 'Quit IntelliCode')}`);
    console.log(`  ${boxBottom()}`);
    process.stdout.write('\n');
    // ── Response control ──
    console.log(`  ${boxTop('⬡  Response Control')}`);
    console.log(`  ${row('Ctrl+C', 'Stop the current response mid-stream')}`);
    console.log(`  ${boxLine(`  ${note('The')} ${cmd('⠋ Thinking…')} ${note('spinner shows while the model generates')}`)}`);
    console.log(`  ${boxBottom()}`);
    process.stdout.write('\n');
    // ── Model & Reasoning ──
    console.log(`  ${boxTop('◈  Model & Reasoning')}`);
    console.log(`  ${row('/models', 'List models and select one interactively')}`);
    console.log(`  ${row('/think [level]', 'Set reasoning intensity')}`);
    console.log(`  ${boxLine(`     ${note('levels:')}  ${cmd('off')}  ${cmd('on')}  ${cmd('low')}  ${cmd('medium')} ${note('(default)')}  ${cmd('high')}`)}`);
    console.log(`  ${boxBottom()}`);
    process.stdout.write('\n');
    // ── Memory ──
    console.log(`  ${boxTop('◉  Memory')}`);
    console.log(`  ${row('/memory list', 'Show all stored memories')}`);
    console.log(`  ${row('/memory set <k> <v>', 'Store a key-value memory')}`);
    console.log(`  ${row('/memory delete <key>', 'Delete a memory by key')}`);
    console.log(`  ${row('/memory clear', 'Clear all memories')}`);
    console.log(`  ${boxBottom()}`);
    process.stdout.write('\n');
    // ── Skills (Smithery) ──
    console.log(`  ${boxTop('◈  Skills  —  Smithery Ecosystem')}`);
    console.log(`  ${row('/skills list', 'Show installed skills')}`);
    console.log(`  ${row('/skills search <q>', 'Search Smithery registry')}`);
    console.log(`  ${row('/skills popular', 'Browse top skills from Smithery')}`);
    console.log(`  ${row('/skills add <id> [nm]', 'Install a skill from Smithery')}`);
    console.log(`  ${row('/skills remove <name>', 'Uninstall a skill')}`);
    console.log(`  ${row('/skills create <name>', 'Scaffold a new skill locally')}`);
    console.log(`  ${boxBottom()}`);
    process.stdout.write('\n');
    // ── MCP Servers ──
    console.log(`  ${boxTop('⬡  MCP Servers')}`);
    console.log(`  ${row('/mcp list', 'List configured MCP servers')}`);
    console.log(`  ${row('/mcp install <pkg>', 'Install and register an MCP package')}`);
    console.log(`  ${boxBottom()}`);
    process.stdout.write('\n');
    // ── Maintenance ──
    console.log(`  ${boxTop('◎  Maintenance')}`);
    console.log(`  ${row('/update', 'Pull latest changes and rebuild')}`);
    console.log(`  ${row('/status', 'Show model, memory, MCP & skills summary')}`);
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
    console.log(`  ${boxTop(`◈  ${title}`)}`);
    console.log(`  ${boxLine()}`);
    results.forEach((s, i) => {
        const num = padTo(`${exports.C.cyan}${String(i + 1).padStart(2, ' ')}.${exports.C.reset}`, 6);
        const name = `${exports.C.bold}${exports.C.cyan}${s.qualifiedName}${exports.C.reset}`;
        const badge = s.isVerified ? ` ${exports.C.greenB}✓ verified${exports.C.reset}` : '';
        const uses = s.useCount !== undefined && s.useCount > 0
            ? ` ${exports.C.gray}· ${s.useCount.toLocaleString()} uses${exports.C.reset}`
            : '';
        const desc = s.description
            ? s.description.length > 52
                ? s.description.slice(0, 49) + '…'
                : s.description
            : '';
        console.log(`  ${boxLine(`  ${num}  ${name}${badge}${uses}`)}`);
        if (desc) {
            console.log(`  ${boxLine(`        ${exports.C.gray}${desc}${exports.C.reset}`)}`);
        }
    });
    console.log(`  ${boxLine()}`);
    console.log(`  ${boxBottom()}`);
    console.log(`  ${exports.C.gray}  ◦ Install with:${exports.C.reset}  ${exports.C.cyan}/skills add <qualifiedName>${exports.C.reset}\n`);
}
/**
 * Print the list of currently installed skills.
 * @param skills  Array of InstalledSkill records.
 */
function printInstalledSkills(skills) {
    if (skills.length === 0) {
        console.log(`  ${exports.C.gray}◦ No skills installed.${exports.C.reset}  ` +
            `${exports.C.cyan}/skills search <query>${exports.C.reset}${exports.C.gray} to discover skills.${exports.C.reset}\n`);
        return;
    }
    process.stdout.write('\n');
    console.log(`  ${boxTop(`◈  Installed Skills  (${skills.length})`)}`);
    console.log(`  ${boxLine()}`);
    for (const s of skills) {
        const name = `${exports.C.bold}${exports.C.magenta}${s.name}${exports.C.reset}`;
        const qn = `${exports.C.gray}${s.qualifiedName}${exports.C.reset}`;
        const desc = s.description
            ? `  ${exports.C.dim}${exports.C.gray}${s.description.length > 38 ? s.description.slice(0, 35) + '…' : s.description}${exports.C.reset}`
            : '';
        console.log(`  ${boxLine(`  ${exports.C.cyan}◈${exports.C.reset}  ${name}  ${qn}${desc}`)}`);
    }
    console.log(`  ${boxLine()}`);
    console.log(`  ${boxBottom()}`);
    process.stdout.write('\n');
}
//# sourceMappingURL=ui.js.map