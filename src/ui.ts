/**
 * IntelliCode UI — modern terminal design utilities
 *
 * All visual output (banner, spinner, boxes, status, help) lives here
 * so that index.ts and planner.ts stay focused on logic.
 *
 * Color palette  : sky-blue / cyan as the primary brand accent
 * Box style       : rounded corners (╭ ╮ ╰ ╯) with thin lines
 * Width           : 72 columns outer / 70 columns inner content
 */

// ─── ANSI palette ──────────────────────────────────────────────────────────────

export const C = {
  cyan:    '\x1b[96m',  // bright cyan  — primary brand
  cyanD:   '\x1b[36m',  // dim cyan     — accents
  white:   '\x1b[97m',  // bright white — main text
  gray:    '\x1b[90m',  // dark gray    — secondary / hints
  green:   '\x1b[32m',  // green        — success
  red:     '\x1b[31m',  // red          — errors
  yellow:  '\x1b[33m',  // yellow       — warnings
  bold:    '\x1b[1m',
  reset:   '\x1b[0m',
} as const;

// ─── Box drawing ───────────────────────────────────────────────────────────────

const BOX_OUTER = 72;          // total columns including the two │ chars
const BOX_INNER = BOX_OUTER - 2; // 70 — chars between │ and │

/** Strip ANSI escape codes to obtain the printable (visible) length. */
function visLen(s: string): number {
  return s.replace(/\x1b\[[0-9;]*m/g, '').length;
}

/** Pad a string with trailing spaces so its visible width equals `width`. */
function padTo(s: string, width: number): string {
  const extra = width - visLen(s);
  return extra > 0 ? s + ' '.repeat(extra) : s;
}

/** A single box content row: │ ‹space› content ‹padding› ‹space› │  */
function boxLine(content: string = ''): string {
  // inner layout: 1 space + content + padding + 1 space  =  BOX_INNER (70)
  const padded = padTo(content, BOX_INNER - 2);
  return `${C.cyan}│${C.reset} ${padded} ${C.cyan}│${C.reset}`;
}

/** Top border: ╭─…─╮  (optionally with a centred label). */
function boxTop(label?: string): string {
  if (label) {
    const lbl = ` ${label} `;
    const fill = '─'.repeat(BOX_INNER - visLen(lbl));
    return `${C.cyan}╭─${lbl}${fill}╮${C.reset}`;
  }
  return `${C.cyan}╭${'─'.repeat(BOX_INNER)}╮${C.reset}`;
}

/** Bottom border: ╰─…─╯ */
function boxBottom(): string {
  return `${C.cyan}╰${'─'.repeat(BOX_INNER)}╯${C.reset}`;
}

/** Mid-rule: ├─…─┤ (optionally with a left-aligned label). */
function boxMid(label?: string): string {
  if (label) {
    const lbl = ` ${label} `;
    const fill = '─'.repeat(BOX_INNER - visLen(lbl));
    return `${C.cyan}├─${lbl}${fill}┤${C.reset}`;
  }
  return `${C.cyan}├${'─'.repeat(BOX_INNER)}┤${C.reset}`;
}

// ─── Banner ────────────────────────────────────────────────────────────────────

/**
 * Print the full IntelliCode startup banner to stdout.
 * @param version  package version string, e.g. "0.1.0"
 */
export function printBanner(version: string): void {
  const logoText = `${C.bold}${C.cyan}I N T E L L I C O D E${C.reset}`;
  const logoLine = `  ${C.cyan}◈${C.reset}  ${logoText}`;

  const subText  = `  AI Coding Agent  ·  GitHub Copilot  ·  `;
  const verText  = `${C.cyan}v${version}${C.reset}`;
  const subLine  = `${C.gray}${subText}${verText}${C.reset}`;

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
export function printWelcome(): void {
  console.log(
    `  ${C.gray}◦ Type your request and press ${C.reset}Enter` +
    `${C.gray}  ◦ ${C.reset}/help${C.gray} for all commands` +
    `  ◦ ${C.reset}Ctrl+C${C.gray} to stop a response${C.reset}`
  );
  process.stdout.write('\n');
}

// ─── Spinners ──────────────────────────────────────────────────────────────────

const BRAILLE = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * Create an animated thinking spinner.
 * Returns a `stop()` function that clears the spinner line.
 */
export function createThinkingSpinner(): { stop: () => void } {
  let idx = 0;
  const frame = () =>
    `\r${C.cyan}${BRAILLE[idx]}${C.reset}  ${C.gray}Thinking…${C.reset}   `;
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
export function createExecutingSpinner(): () => void {
  let idx = 0;
  const frame = () =>
    `\r${C.cyan}${BRAILLE[idx]}${C.reset}  ${C.gray}Executing…${C.reset}   `;
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
export const PROMPT =
  `${C.cyan}❯${C.reset}  ${C.bold}${C.cyan}intellicode${C.reset}  ${C.gray}›${C.reset}  `;

// ─── /status box ───────────────────────────────────────────────────────────────

/** Key-value row for the status box — left col is 12 chars wide. */
function statusRow(key: string, value: string): string {
  const k = padTo(`${C.gray}${key}${C.reset}`, 12);
  return boxLine(`  ${k}  ${value}`);
}

export interface StatusInfo {
  model:      string;
  thinkLevel: string;
  memories:   number;
  history:    number;
  mcpServers: string[];
}

/** Print a bordered status box to stdout. */
export function printStatus(info: StatusInfo): void {
  const mcp = info.mcpServers.length > 0
    ? info.mcpServers.map((s) => `${C.cyan}${s}${C.reset}`).join(', ')
    : `${C.gray}(none)${C.reset}`;

  process.stdout.write('\n');
  console.log(`  ${boxTop('Status')}`);
  console.log(`  ${statusRow('Model',       `${C.cyan}${info.model}${C.reset}`)}`);
  console.log(`  ${statusRow('Think',       `${C.cyan}${info.thinkLevel}${C.reset}`)}`);
  console.log(`  ${statusRow('Memory',      `${info.memories} stored`)}`);
  console.log(`  ${statusRow('History',     `${info.history} messages`)}`);
  console.log(`  ${statusRow('MCP Servers', mcp)}`);
  console.log(`  ${boxBottom()}`);
  process.stdout.write('\n');
}

// ─── /help ─────────────────────────────────────────────────────────────────────

/** Print the full REPL help, organized into bordered sections. */
export function printHelp(): void {
  const cmd  = (c: string) => `${C.cyan}${c}${C.reset}`;
  const note = (n: string) => `${C.gray}${n}${C.reset}`;

  /** Two-column command row:  cmd (20 wide)  description */
  const row = (c: string, d: string) => {
    // padTo uses visible length, so just pass the target visible width (20)
    const fmtC = padTo(cmd(c), 20);
    return boxLine(`  ${fmtC}  ${note(d)}`);
  };

  process.stdout.write('\n');

  // ── Conversation ──
  console.log(`  ${boxTop('Conversation')}`);
  console.log(`  ${row('/clear, /reset',   'Clear conversation context')}`);
  console.log(`  ${row('/history',         'Show messages in context')}`);
  console.log(`  ${row('/exit, /quit',      'Quit IntelliCode')}`);
  console.log(`  ${boxBottom()}`);
  process.stdout.write('\n');

  // ── Response control ──
  console.log(`  ${boxTop('Response Control')}`);
  console.log(`  ${row('Ctrl+C',           'Stop the current response mid-stream')}`);
  console.log(`  ${boxLine(`  ${note('The')} ${cmd('⠋ Thinking…')} ${note('spinner is shown while the model generates')}`)}`);
  console.log(`  ${boxBottom()}`);
  process.stdout.write('\n');

  // ── Model & Reasoning ──
  console.log(`  ${boxTop('Model & Reasoning')}`);
  console.log(`  ${row('/models',          'List models and select one interactively')}`);
  console.log(`  ${row('/think [level]',   'Set reasoning intensity')}`);
  console.log(`  ${boxLine(`  ${note('  levels: ')}${cmd('off')} ${note('|')} ${cmd('on')} ${note('|')} ${cmd('low')} ${note('|')} ${cmd('medium')} ${note('(default) |')} ${cmd('high')}`)}`);
  console.log(`  ${boxBottom()}`);
  process.stdout.write('\n');

  // ── Memory ──
  console.log(`  ${boxTop('Memory')}`);
  console.log(`  ${row('/memory list',         'Show all stored memories')}`);
  console.log(`  ${row('/memory set <k> <v>',  'Store a key-value memory')}`);
  console.log(`  ${row('/memory delete <key>', 'Delete a memory by key')}`);
  console.log(`  ${row('/memory clear',        'Clear all memories')}`);
  console.log(`  ${boxBottom()}`);
  process.stdout.write('\n');

  // ── MCP Servers ──
  console.log(`  ${boxTop('MCP Servers')}`);
  console.log(`  ${row('/mcp list',            'List configured MCP servers')}`);
  console.log(`  ${row('/mcp install <pkg>',   'Install and register an MCP package')}`);
  console.log(`  ${boxBottom()}`);
  process.stdout.write('\n');

  // ── Penpot ──
  console.log(`  ${boxTop('Penpot Design')}`);
  console.log(`  ${row('/penpot connect',  'Guided Penpot MCP setup')}`);
  console.log(`  ${row('/penpot status',   'Show Penpot connection status')}`);
  console.log(`  ${row('/penpot help',     'Penpot workflow tips')}`);
  console.log(`  ${boxBottom()}`);
  process.stdout.write('\n');

  // ── Maintenance ──
  console.log(`  ${boxTop('Maintenance')}`);
  console.log(`  ${row('/update',  'Pull latest changes and rebuild')}`);
  console.log(`  ${row('/status',  'Show model, think level, memory & MCP info')}`);
  console.log(`  ${row('/help',    'Show this help message')}`);
  console.log(`  ${boxBottom()}`);
  process.stdout.write('\n');
}
