#!/usr/bin/env node
"use strict";
/**
 * IntelliCode — CLI entry point
 *
 * Usage:
 *   intellicode                       Interactive REPL
 *   intellicode "do something"        Single-shot prompt
 *   intellicode auth login            Authenticate with GitHub Copilot
 *   intellicode auth logout           Remove stored credentials
 *   intellicode auth status           Show authentication status
 *   intellicode mcp init              Create a sample MCP config
 *   intellicode mcp list              List configured MCP servers
 *   intellicode --help                Show help
 *   intellicode --version             Show version
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const readline = __importStar(require("readline"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const commander_1 = require("commander");
const github_copilot_1 = require("./providers/github-copilot");
const planner_1 = require("./agent/planner");
const manager_1 = require("./mcp/manager");
const manager_2 = require("./memory/manager");
// ─── Package metadata ──────────────────────────────────────────────────────────
const PKG_PATH = path.join(__dirname, '..', 'package.json');
let PKG_VERSION = '0.1.0';
try {
    const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf-8'));
    PKG_VERSION = pkg.version;
}
catch {
    // use default
}
// ─── Active streaming state ────────────────────────────────────────────────────
// Shared between runRepl and the SIGINT handler registered in main().
/** Non-null while the agent is streaming a response. */
let activeAbortController = null;
// ─── Spinner ──────────────────────────────────────────────────────────────────
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
function createSpinner() {
    let idx = 0;
    // Write initial frame immediately
    process.stdout.write(`\r\x1b[96m${SPINNER_FRAMES[0]} Thinking…\x1b[0m`);
    const interval = setInterval(() => {
        idx = (idx + 1) % SPINNER_FRAMES.length;
        process.stdout.write(`\r\x1b[96m${SPINNER_FRAMES[idx]} Thinking…\x1b[0m`);
    }, 80);
    return {
        stop: () => {
            clearInterval(interval);
            // Erase the spinner line so the model response starts cleanly
            process.stdout.write('\r\x1b[2K');
        },
    };
}
// ─── Banner ────────────────────────────────────────────────────────────────────
function printBanner() {
    console.log(`
\x1b[96m  ___       _       _ _ _  _____          _      
 |_ _|_ __ | |_ ___| | (_)/ ____|___   __| | ___ 
  | || '_ \\| __/ _ \\ | | | |   / _ \\ / _\` |/ _ \\
  | || | | | ||  __/ | | | |__| (_) | (_| |  __/
 |___|_| |_|\\__\\___|_|_|_|\\_____\\___/ \\__,_|\\___|
\x1b[0m`);
    console.log(`  \x1b[90mAI coding agent powered by GitHub Copilot  v${PKG_VERSION}\x1b[0m\n`);
}
// ─── REPL ──────────────────────────────────────────────────────────────────────
async function runRepl(planner, mcpManager, memoryManager) {
    printBanner();
    console.log('\x1b[90mType your request and press Enter. Type \x1b[0m/help\x1b[90m to see all commands.\x1b[0m\n');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: '\x1b[96m➜ intellicode\x1b[0m  ',
        terminal: true,
    });
    rl.prompt();
    rl.on('line', async (line) => {
        const input = line.trim();
        if (!input) {
            rl.prompt();
            return;
        }
        // ── Built-in REPL commands ──────────────────────────────────────────────
        if (input === '/exit' || input === '/quit') {
            console.log('\n\x1b[96mGoodbye!\x1b[0m\n');
            rl.close();
            process.exit(0);
        }
        if (input === '/clear' || input === '/reset') {
            planner.resetHistory();
            console.log('\x1b[90m(Context cleared)\x1b[0m\n');
            rl.prompt();
            return;
        }
        if (input === '/history') {
            console.log(`\x1b[90m(${planner.historyLength} messages in context)\x1b[0m\n`);
            rl.prompt();
            return;
        }
        if (input === '/help') {
            printReplHelp();
            rl.prompt();
            return;
        }
        if (input === '/status') {
            printStatus(planner, mcpManager, memoryManager);
            rl.prompt();
            return;
        }
        // ── /models command ──────────────────────────────────────────────────────
        if (input === '/models') {
            rl.pause();
            await handleModelsCommand(planner, rl);
            rl.resume();
            rl.prompt();
            return;
        }
        // ── /think command ───────────────────────────────────────────────────────
        if (input.startsWith('/think')) {
            handleThinkCommand(input, planner);
            rl.prompt();
            return;
        }
        // ── /memory command ──────────────────────────────────────────────────────
        if (input.startsWith('/memory')) {
            handleMemoryCommand(input, memoryManager);
            rl.prompt();
            return;
        }
        // ── /update command ──────────────────────────────────────────────────────
        if (input === '/update') {
            rl.pause();
            await handleUpdateCommand();
            rl.resume();
            rl.prompt();
            return;
        }
        // ── /mcp command ─────────────────────────────────────────────────────────
        if (input.startsWith('/mcp')) {
            rl.pause();
            await handleMcpReplCommand(input, mcpManager);
            rl.resume();
            rl.prompt();
            return;
        }
        // ── /penpot command ───────────────────────────────────────────────────────
        if (input.startsWith('/penpot')) {
            rl.pause();
            await handlePenpotCommand(input, mcpManager, memoryManager, rl);
            rl.resume();
            rl.prompt();
            return;
        }
        // ── Regular prompt ────────────────────────────────────────────────────────
        rl.pause();
        process.stdout.write('\n');
        // Start the "Thinking…" spinner before the first token arrives
        const spinner = createSpinner();
        let spinnerStopped = false;
        const stopSpinnerOnce = () => {
            if (!spinnerStopped) {
                spinnerStopped = true;
                spinner.stop();
            }
        };
        // Create an abort controller so Ctrl+C can cancel this request
        activeAbortController = new AbortController();
        const { signal } = activeAbortController;
        try {
            await planner.run(input, (token) => {
                stopSpinnerOnce();
                process.stdout.write(token);
            }, signal);
            stopSpinnerOnce();
            process.stdout.write('\n\n');
        }
        catch (err) {
            stopSpinnerOnce();
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`\n\x1b[31mError: ${msg}\x1b[0m\n`);
        }
        finally {
            activeAbortController = null;
        }
        rl.resume();
        rl.prompt();
    });
    rl.on('close', () => {
        console.log('\n\x1b[96mGoodbye!\x1b[0m\n');
        process.exit(0);
    });
}
function printReplHelp() {
    console.log(`
\x1b[96mAvailable REPL commands:\x1b[0m

  \x1b[96mConversation\x1b[0m
    /clear, /reset   Clear conversation context
    /history         Show number of messages in context
    /exit, /quit     Quit intellicode

  \x1b[96mResponse control\x1b[0m
    Ctrl+C           Stop the current response mid-stream (press again to exit)
    (A \x1b[96m⠋ Thinking…\x1b[0m spinner is shown while the model is generating)

  \x1b[96mModel & Reasoning\x1b[0m
    /models          List available models and select one interactively
    /think [level]   Set reasoning intensity: off | on | low | medium | high
                     • off      — disable deep reasoning (fast, concise)
                     • on       — re-enable reasoning (restores to medium)
                     • low      — light reasoning
                     • medium   — balanced (default)
                     • high     — deep, careful reasoning
                     (no argument shows the current level)

  \x1b[96mMemory\x1b[0m
    /memory list               List all stored memories
    /memory set <key> <value>  Store a key-value memory
    /memory delete <key>       Delete a memory by key
    /memory clear              Clear all memories

  \x1b[96mMCP Servers\x1b[0m
    /mcp list        List configured and running MCP servers
    /mcp install <pkg> [name]
                     Install an npm MCP package and register it
                     Example: /mcp install @modelcontextprotocol/server-brave-search brave-search

  \x1b[96mPenpot Design Integration\x1b[0m
    /penpot connect  Connect to Penpot MCP (guided setup with token prompt)
    /penpot status   Show current Penpot connection status
    /penpot help     Show Penpot workflow tips
    (You can also just ask the agent to "design a login page" and it will
    automatically configure the Penpot MCP server and use it.)

  \x1b[96mMaintenance\x1b[0m
    /update          Pull latest changes, install deps, and rebuild

  \x1b[96mInfo\x1b[0m
    /status          Show current model, think level, memory count, and MCP servers
    /help            Show this help message
`);
}
// ─── /status ──────────────────────────────────────────────────────────────────
function printStatus(planner, mcpManager, memoryManager) {
    const configs = mcpManager.getConfigs();
    console.log(`
\x1b[96mIntelliCode status:\x1b[0m
  Model       : \x1b[96m${planner.getModel()}\x1b[0m
  Think level : \x1b[96m${planner.getThinkLevelDescription()}\x1b[0m
  Memories    : ${memoryManager.size} stored
  History     : ${planner.historyLength} messages
  MCP servers : ${configs.length > 0 ? configs.map((c) => c.name).join(', ') : '(none)'}
`);
}
// ─── /models ──────────────────────────────────────────────────────────────────
async function handleModelsCommand(planner, rl) {
    console.log('\n\x1b[90mFetching available models…\x1b[0m');
    let models;
    try {
        models = await (0, github_copilot_1.listModels)();
    }
    catch {
        console.warn('\x1b[33m⚠  Could not fetch models from API — showing defaults\x1b[0m');
        models = ['gpt-4o', 'gpt-4', 'claude-3.5-sonnet'];
    }
    const current = planner.getModel();
    console.log('\n\x1b[96mAvailable models:\x1b[0m\n');
    models.forEach((m, i) => {
        const marker = m === current ? '\x1b[32m✓\x1b[0m' : ' ';
        console.log(`  ${marker} \x1b[96m${i + 1}\x1b[0m. ${m}`);
    });
    console.log();
    return new Promise((resolve) => {
        rl.question(`\x1b[90mEnter number to select (current: ${current}), or press Enter to cancel:\x1b[0m `, (answer) => {
            const n = parseInt(answer.trim(), 10);
            if (!isNaN(n) && n >= 1 && n <= models.length) {
                const chosen = models[n - 1];
                planner.setModel(chosen);
                (0, github_copilot_1.saveModelSettings)(chosen, planner.getThinkLevel());
                console.log(`\x1b[32m✓ Model set to \x1b[96m${chosen}\x1b[0m\n`);
            }
            else if (answer.trim() !== '') {
                console.log('\x1b[90m(Invalid selection — model unchanged)\x1b[0m\n');
            }
            else {
                console.log('\x1b[90m(Cancelled)\x1b[0m\n');
            }
            resolve();
        });
    });
}
// ─── /think ───────────────────────────────────────────────────────────────────
function handleThinkCommand(input, planner) {
    const parts = input.split(/\s+/);
    const level = parts[1]?.toLowerCase();
    if (!level) {
        const cur = planner.getThinkLevel();
        console.log(`\x1b[90mCurrent think level: \x1b[96m${cur}\x1b[0m\n`);
        return;
    }
    // 'on' is an alias for re-enabling reasoning at the default medium level
    if (level === 'on') {
        planner.setThinkLevel('medium');
        (0, github_copilot_1.saveModelSettings)(planner.getModel(), 'medium');
        console.log('\x1b[32m✓ Thinking enabled\x1b[0m (level: \x1b[96mmedium\x1b[0m)\n');
        return;
    }
    if (level !== 'off' && level !== 'low' && level !== 'medium' && level !== 'high') {
        console.log('\x1b[31mInvalid think level.\x1b[0m Use: ' +
            '\x1b[96moff\x1b[0m | \x1b[96mon\x1b[0m | \x1b[96mlow\x1b[0m | \x1b[96mmedium\x1b[0m | \x1b[96mhigh\x1b[0m\n');
        return;
    }
    planner.setThinkLevel(level);
    (0, github_copilot_1.saveModelSettings)(planner.getModel(), level);
    if (level === 'off') {
        console.log('\x1b[32m✓ Thinking disabled\x1b[0m (fast response mode)\n');
    }
    else {
        console.log(`\x1b[32m✓ Think level set to \x1b[96m${level}\x1b[0m\n`);
    }
}
// ─── /memory ──────────────────────────────────────────────────────────────────
function handleMemoryCommand(input, memoryManager) {
    const parts = input.split(/\s+/);
    const sub = parts[1]?.toLowerCase();
    if (!sub || sub === 'list') {
        const entries = memoryManager.getAll();
        if (entries.length === 0) {
            console.log('\x1b[90m(No memories stored)\x1b[0m\n');
            return;
        }
        console.log('\n\x1b[96mStored memories:\x1b[0m\n');
        for (const e of entries) {
            console.log(`  \x1b[96m${e.key}\x1b[0m: ${e.value}`);
        }
        console.log();
        return;
    }
    if (sub === 'set') {
        const key = parts[2];
        const value = parts.slice(3).join(' ');
        if (!key || !value) {
            console.log('\x1b[31mUsage:\x1b[0m /memory set <key> <value>\n');
            return;
        }
        memoryManager.set(key, value);
        console.log(`\x1b[32m✓ Memory saved:\x1b[0m \x1b[96m${key}\x1b[0m = ${value}\n`);
        return;
    }
    if (sub === 'delete' || sub === 'del') {
        const key = parts[2];
        if (!key) {
            console.log('\x1b[31mUsage:\x1b[0m /memory delete <key>\n');
            return;
        }
        if (memoryManager.delete(key)) {
            console.log(`\x1b[32m✓ Memory deleted:\x1b[0m \x1b[96m${key}\x1b[0m\n`);
        }
        else {
            console.log(`\x1b[90m(No memory found with key: ${key})\x1b[0m\n`);
        }
        return;
    }
    if (sub === 'clear') {
        memoryManager.clear();
        console.log('\x1b[32m✓ All memories cleared\x1b[0m\n');
        return;
    }
    console.log('\x1b[31mUnknown /memory subcommand.\x1b[0m\n' +
        'Usage:\n' +
        '  /memory list\n' +
        '  /memory set <key> <value>\n' +
        '  /memory delete <key>\n' +
        '  /memory clear\n');
}
// ─── /update ──────────────────────────────────────────────────────────────────
async function handleUpdateCommand() {
    // The package root is one directory above dist/ (where __dirname points)
    const repoDir = path.resolve(path.join(__dirname, '..'));
    console.log('\n\x1b[96mUpdating IntelliCode…\x1b[0m\n');
    const { executeCommand } = await Promise.resolve().then(() => __importStar(require('./tools/shell')));
    // Verify that repoDir is actually a git repository before running commands
    const gitCheck = await executeCommand('git rev-parse --is-inside-work-tree', repoDir, 5000);
    if (gitCheck.exitCode !== 0) {
        console.log('\x1b[31m✗ Cannot update:\x1b[0m The install directory is not a git repository.\n' +
            `  Directory: ${repoDir}\n` +
            '  To update, re-run the installation script instead.\n');
        return;
    }
    console.log('\x1b[90m→ Pulling latest changes from repository…\x1b[0m');
    const pullResult = await executeCommand('git pull', repoDir, 60000);
    if (pullResult.exitCode !== 0) {
        console.log('\x1b[31m✗ git pull failed\x1b[0m');
        if (pullResult.stderr)
            console.log(`  stderr: ${pullResult.stderr}`);
        if (pullResult.stdout)
            console.log(`  stdout: ${pullResult.stdout}`);
        console.log();
        return;
    }
    const pullOutput = pullResult.stdout.trim() || 'Already up to date.';
    console.log(`\x1b[32m✓ ${pullOutput}\x1b[0m`);
    console.log('\x1b[90m→ Installing dependencies…\x1b[0m');
    const installResult = await executeCommand('npm install', repoDir, 120000);
    if (installResult.exitCode !== 0) {
        console.log('\x1b[31m✗ npm install failed\x1b[0m');
        if (installResult.stderr)
            console.log(`  stderr: ${installResult.stderr}`);
        if (installResult.stdout)
            console.log(`  stdout: ${installResult.stdout}`);
        console.log();
        return;
    }
    console.log('\x1b[32m✓ Dependencies installed\x1b[0m');
    console.log('\x1b[90m→ Rebuilding…\x1b[0m');
    const buildResult = await executeCommand('npm run build', repoDir, 120000);
    if (buildResult.exitCode !== 0) {
        console.log('\x1b[31m✗ Build failed\x1b[0m');
        if (buildResult.stderr)
            console.log(`  stderr: ${buildResult.stderr}`);
        if (buildResult.stdout)
            console.log(`  stdout: ${buildResult.stdout}`);
        console.log();
        return;
    }
    console.log('\x1b[32m✓ Build complete\x1b[0m');
    console.log('\n\x1b[32m✓ IntelliCode updated successfully!\x1b[0m ' +
        '\x1b[90mPlease restart intellicode to use the new version.\x1b[0m\n');
}
async function handleMcpReplCommand(input, mcpManager) {
    const parts = input.split(/\s+/);
    const sub = parts[1]?.toLowerCase();
    if (sub === 'list') {
        const configs = mcpManager.getConfigs();
        if (configs.length === 0) {
            console.log('\x1b[90m(No MCP servers configured)\x1b[0m\n');
            return;
        }
        console.log('\n\x1b[96mConfigured MCP servers:\x1b[0m\n');
        for (const c of configs) {
            const cmd = [c.command, ...(c.args ?? [])].join(' ');
            console.log(`  \x1b[96m${c.name}\x1b[0m  —  ${cmd}`);
        }
        console.log();
        return;
    }
    if (sub === 'install') {
        const pkg = parts[2];
        if (!pkg) {
            console.log('\x1b[31mUsage:\x1b[0m /mcp install <npm-package> [server-name]\n');
            return;
        }
        const rawName = parts[3] ?? pkg.replace(/^@[^/]+\//, '').replace(/^server-/, '');
        // Sanitize: keep only alphanumeric, hyphens, underscores; fall back to 'mcp-server' if empty
        const name = rawName.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^-+|-+$/g, '') || 'mcp-server';
        console.log(`\n\x1b[90mInstalling ${pkg}…\x1b[0m`);
        const { executeCommand } = await Promise.resolve().then(() => __importStar(require('./tools/shell')));
        const installResult = await executeCommand(`npm install -g ${pkg}`);
        if (installResult.exitCode !== 0) {
            console.log(`\x1b[31mInstallation failed (exit ${installResult.exitCode}):\x1b[0m\n${installResult.stderr}\n`);
            return;
        }
        console.log(`\x1b[32m✓ Package installed\x1b[0m`);
        try {
            await mcpManager.installAndStartServer({
                name,
                command: 'npx',
                args: ['-y', pkg],
                env: {},
            });
            console.log(`\x1b[32m✓ MCP server \x1b[96m${name}\x1b[32m started and registered\x1b[0m\n`);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.log(`\x1b[31mServer registered but failed to start: ${msg}\x1b[0m\n` +
                'It was saved to config — it will be retried on next launch.\n');
        }
        return;
    }
    console.log('\x1b[31mUnknown /mcp subcommand.\x1b[0m\n' +
        'Usage:\n  /mcp list\n  /mcp install <package> [name]\n');
}
// ─── /penpot ──────────────────────────────────────────────────────────────────
const PENPOT_SERVER_NAME = 'penpot';
const PENPOT_DEFAULT_BASE_URL = 'https://design.penpot.app';
async function handlePenpotCommand(input, mcpManager, memoryManager, rl) {
    const parts = input.split(/\s+/);
    const sub = parts[1]?.toLowerCase();
    if (!sub || sub === 'help') {
        console.log(`
\x1b[96mPenpot MCP Integration\x1b[0m

Penpot is an open-source design tool. IntelliCode can connect to Penpot's
MCP server and autonomously create UI/UX designs, then generate code from them.

\x1b[96mCommands:\x1b[0m
  /penpot connect   Set up the Penpot MCP connection (guided)
  /penpot status    Show whether Penpot MCP is configured
  /penpot help      Show this message

\x1b[96mWorkflow:\x1b[0m
  1. Run \x1b[96m/penpot connect\x1b[0m and provide your Penpot access token.
  2. Ask the agent to design something, e.g.:
       "Design a login page and generate React code from the design"
  3. The agent will create the design in Penpot, inspect it, and write
     pixel-perfect code that matches the design.

\x1b[96mGet a Penpot token:\x1b[0m
  Log in at \x1b[36mhttps://design.penpot.app\x1b[0m → Profile → Access tokens → New token
  (For self-hosted Penpot, use your own base URL.)
`);
        return;
    }
    if (sub === 'status') {
        const configs = mcpManager.getConfigs();
        const penpot = configs.find((c) => c.name === PENPOT_SERVER_NAME);
        if (penpot) {
            const baseUrl = penpot.env?.['PENPOT_BASE_URL'] ?? PENPOT_DEFAULT_BASE_URL;
            console.log(`\x1b[32m✓ Penpot MCP is configured\x1b[0m\n` +
                `  Base URL : \x1b[96m${baseUrl}\x1b[0m\n` +
                `  Token    : \x1b[90m(stored)\x1b[0m\n`);
        }
        else {
            console.log('\x1b[33m⚠  Penpot MCP is not configured.\x1b[0m\n' +
                'Run \x1b[96m/penpot connect\x1b[0m to set it up.\n');
        }
        return;
    }
    if (sub === 'connect') {
        console.log('\n\x1b[96mPenpot MCP Setup\x1b[0m\n');
        // Try to load a previously stored token from long-term memory
        const storedToken = memoryManager.get('penpot_access_token');
        const storedBaseUrl = memoryManager.get('penpot_base_url') ?? PENPOT_DEFAULT_BASE_URL;
        let token = storedToken ?? '';
        let baseUrl = storedBaseUrl;
        await new Promise((resolve) => {
            const askBaseUrl = () => {
                rl.question(`\x1b[90mPenpot base URL [${baseUrl}]:\x1b[0m `, (ans) => {
                    const trimmed = ans.trim();
                    if (trimmed)
                        baseUrl = trimmed;
                    askToken();
                });
            };
            const askToken = () => {
                // Don't reveal any characters of a stored token — just indicate one exists
                const hint = token ? ' [token already set — press Enter to keep]' : '';
                rl.question(`\x1b[90mPenpot access token${hint}:\x1b[0m `, (ans) => {
                    const trimmed = ans.trim();
                    if (trimmed)
                        token = trimmed;
                    resolve();
                });
            };
            askBaseUrl();
        });
        if (!token) {
            console.log('\x1b[31m✗ No token provided. Penpot setup cancelled.\x1b[0m\n');
            return;
        }
        // Persist to long-term memory so future sessions reuse the credentials
        memoryManager.set('penpot_access_token', token);
        memoryManager.set('penpot_base_url', baseUrl);
        console.log('\x1b[90mStarting Penpot MCP server…\x1b[0m');
        // ── Prerequisite: ensure pnpm is installed ────────────────────────────
        const { executeCommand: execCmd } = await Promise.resolve().then(() => __importStar(require('./tools/shell')));
        const pnpmCheck = await execCmd(`${(0, manager_1.resolveCommand)('pnpm')} --version`, undefined, 5000);
        if (pnpmCheck.exitCode !== 0) {
            console.log('\x1b[90mpnpm not found — installing automatically…\x1b[0m');
            const pnpmInstall = await execCmd(`${(0, manager_1.resolveCommand)('npm')} install -g pnpm`, undefined, 60000);
            if (pnpmInstall.exitCode === 0) {
                console.log('\x1b[32m✓ pnpm installed\x1b[0m');
            }
            else {
                console.log('\x1b[33m⚠  Could not install pnpm automatically — falling back to npx\x1b[0m');
            }
        }
        try {
            await mcpManager.installAndStartServer({
                name: PENPOT_SERVER_NAME,
                command: 'npx',
                args: ['-y', '@penpot/mcp'],
                env: {
                    PENPOT_ACCESS_TOKEN: token,
                    PENPOT_BASE_URL: baseUrl,
                },
            });
            console.log(`\x1b[32m✓ Penpot MCP connected!\x1b[0m\n` +
                `  Base URL : \x1b[96m${baseUrl}\x1b[0m\n` +
                `\n\x1b[90mYou can now ask the agent to design UI/UX and it will use Penpot.\x1b[0m\n`);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.log(`\x1b[31m✗ Failed to start Penpot MCP server: ${msg}\x1b[0m\n` +
                'The configuration was saved — it will be retried on the next launch.\n' +
                'Make sure @penpot/mcp is accessible via npx (requires Node.js 18+).\n');
        }
        return;
    }
    console.log('\x1b[31mUnknown /penpot subcommand.\x1b[0m\n' +
        'Usage:\n  /penpot connect\n  /penpot status\n  /penpot help\n');
}
async function runSinglePrompt(prompt, planner) {
    try {
        await planner.run(prompt, (token) => {
            process.stdout.write(token);
        });
        process.stdout.write('\n');
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`\x1b[31mError: ${msg}\x1b[0m`);
        process.exit(1);
    }
}
// ─── Auth commands ────────────────────────────────────────────────────────────
async function authLogin() {
    try {
        await (0, github_copilot_1.loginWithDeviceFlow)();
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`\x1b[31mAuthentication error: ${msg}\x1b[0m`);
        process.exit(1);
    }
}
function authLogout() {
    (0, github_copilot_1.logout)();
}
function authStatusCmd() {
    const status = (0, github_copilot_1.authStatus)();
    if (!status.loggedIn) {
        console.log('\x1b[31m✗ Not logged in.\x1b[0m\n' +
            'Run \x1b[33mintellicode auth login\x1b[0m to authenticate.\n');
        return;
    }
    console.log('\x1b[32m✓ Logged in to GitHub Copilot.\x1b[0m');
    if (status.tokenExpiry) {
        console.log(`  Session token expires: ${status.tokenExpiry.toLocaleString()}`);
    }
    console.log(`  Config file: ${(0, github_copilot_1.getConfigPath)()}\n`);
}
// ─── MCP commands ──────────────────────────────────────────────────────────────
function mcpInit() {
    manager_1.McpManager.createSampleConfig();
    console.log(`\nEdit \x1b[33m${manager_1.McpManager.getConfigPath()}\x1b[0m to add your MCP servers.\n`);
}
function mcpList() {
    const configPath = manager_1.McpManager.getConfigPath();
    try {
        if (!fs.existsSync(configPath)) {
            console.log('\x1b[90mNo MCP config found. Run \x1b[0mintellicode mcp init\x1b[90m to create one.\x1b[0m\n');
            return;
        }
        const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        const servers = raw.servers ?? [];
        if (servers.length === 0) {
            console.log('\x1b[90m(No MCP servers configured)\x1b[0m\n');
            return;
        }
        console.log(`\x1b[96mConfigured MCP servers (${configPath}):\x1b[0m\n`);
        for (const s of servers) {
            const cmd = [s.command, ...(s.args ?? [])].join(' ');
            console.log(`  \x1b[96m${s.name}\x1b[0m  —  ${cmd}`);
        }
        console.log();
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Failed to read MCP config: ${msg}`);
    }
}
// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
    const program = new commander_1.Command();
    program
        .name('intellicode')
        .description('AI coding agent powered by GitHub Copilot — works in PowerShell')
        .version(PKG_VERSION, '-v, --version')
        .argument('[prompt]', 'Optional prompt for single-shot mode')
        .action(async (prompt) => {
        // Guard: must be authenticated for agent features
        if (!(0, github_copilot_1.isLoggedIn)()) {
            console.log('\x1b[33mYou are not logged in.\x1b[0m\n' +
                'Run \x1b[96mintellicode auth login\x1b[0m first.\n');
            process.exit(1);
        }
        // Start MCP servers
        const mcpManager = new manager_1.McpManager();
        await mcpManager.load();
        // Load persisted model & think level
        const { model, thinkLevel } = (0, github_copilot_1.loadModelSettings)();
        // Load long-term memory
        const memoryManager = new manager_2.MemoryManager();
        const planner = new planner_1.Planner(mcpManager, memoryManager, model, thinkLevel);
        // Graceful shutdown — Ctrl+C aborts an in-progress response; a second
        // Ctrl+C (when nothing is streaming) exits the process.
        process.on('SIGINT', () => {
            if (activeAbortController) {
                // Abort the current streaming request instead of exiting
                activeAbortController.abort();
                // activeAbortController is cleared by the finally block in runRepl
                process.stdout.write('\n\x1b[90m(Response stopped — press Ctrl+C again to exit)\x1b[0m\n\n');
            }
            else {
                mcpManager.shutdown();
                process.exit(0);
            }
        });
        process.on('SIGTERM', () => {
            mcpManager.shutdown();
            process.exit(0);
        });
        if (prompt) {
            await runSinglePrompt(prompt, planner);
        }
        else {
            await runRepl(planner, mcpManager, memoryManager);
        }
        mcpManager.shutdown();
    });
    // ── auth subcommand ──
    const auth = program.command('auth').description('Manage authentication');
    auth
        .command('login')
        .description('Log in with GitHub Device Flow')
        .action(authLogin);
    auth
        .command('logout')
        .description('Remove stored credentials')
        .action(authLogout);
    auth
        .command('status')
        .description('Show authentication status')
        .action(authStatusCmd);
    // ── mcp subcommand ──
    const mcp = program
        .command('mcp')
        .description('Manage MCP (Model Context Protocol) servers');
    mcp
        .command('init')
        .description('Create a sample MCP configuration file')
        .action(mcpInit);
    mcp
        .command('list')
        .description('List configured MCP servers')
        .action(mcpList);
    await program.parseAsync(process.argv);
}
main().catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\x1b[31mFatal error: ${msg}\x1b[0m`);
    process.exit(1);
});
//# sourceMappingURL=index.js.map