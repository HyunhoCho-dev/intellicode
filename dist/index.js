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
const ui_1 = require("./ui");
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
// ─── REPL ──────────────────────────────────────────────────────────────────────
async function runRepl(planner, mcpManager, memoryManager) {
    (0, ui_1.printBanner)(PKG_VERSION);
    (0, ui_1.printWelcome)();
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: ui_1.PROMPT,
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
            console.log(`\n${ui_1.C.cyan}  Goodbye!${ui_1.C.reset}\n`);
            rl.close();
            process.exit(0);
        }
        if (input === '/clear' || input === '/reset') {
            planner.resetHistory();
            console.log(`${ui_1.C.gray}  ◦ Conversation context cleared.${ui_1.C.reset}\n`);
            rl.prompt();
            return;
        }
        if (input === '/history') {
            console.log(`${ui_1.C.gray}  ◦ ${planner.historyLength} messages in context.${ui_1.C.reset}\n`);
            rl.prompt();
            return;
        }
        if (input === '/help') {
            (0, ui_1.printHelp)();
            rl.prompt();
            return;
        }
        if (input === '/status') {
            const configs = mcpManager.getConfigs();
            (0, ui_1.printStatus)({
                model: planner.getModel(),
                thinkLevel: planner.getThinkLevelDescription(),
                memories: memoryManager.size,
                history: planner.historyLength,
                mcpServers: configs.map((c) => c.name),
            });
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
        const spinner = (0, ui_1.createThinkingSpinner)();
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
            console.error(`\n${ui_1.C.red}  ✗ Error: ${msg}${ui_1.C.reset}\n`);
        }
        finally {
            activeAbortController = null;
        }
        rl.resume();
        rl.prompt();
    });
    rl.on('close', () => {
        console.log(`\n${ui_1.C.cyan}  Goodbye!${ui_1.C.reset}\n`);
        process.exit(0);
    });
}
// ─── /models ──────────────────────────────────────────────────────────────────
async function handleModelsCommand(planner, rl) {
    console.log(`\n${ui_1.C.gray}  Fetching available models…${ui_1.C.reset}`);
    let models;
    try {
        models = await (0, github_copilot_1.listModels)();
    }
    catch {
        console.warn(`${ui_1.C.yellow}  ⚠  Could not fetch models from API — showing defaults${ui_1.C.reset}`);
        models = ['gpt-4o', 'gpt-4', 'claude-3.5-sonnet'];
    }
    const current = planner.getModel();
    console.log(`\n${ui_1.C.cyan}  Available models:${ui_1.C.reset}\n`);
    models.forEach((m, i) => {
        const marker = m === current ? `${ui_1.C.green}✓${ui_1.C.reset}` : ' ';
        console.log(`  ${marker} ${ui_1.C.cyan}${i + 1}${ui_1.C.reset}. ${m}`);
    });
    console.log();
    return new Promise((resolve) => {
        rl.question(`${ui_1.C.gray}  Enter number to select (current: ${current}), or press Enter to cancel:${ui_1.C.reset} `, (answer) => {
            const n = parseInt(answer.trim(), 10);
            if (!isNaN(n) && n >= 1 && n <= models.length) {
                const chosen = models[n - 1];
                planner.setModel(chosen);
                (0, github_copilot_1.saveModelSettings)(chosen, planner.getThinkLevel());
                console.log(`${ui_1.C.green}  ✓ Model set to ${ui_1.C.reset}${ui_1.C.cyan}${chosen}${ui_1.C.reset}\n`);
            }
            else if (answer.trim() !== '') {
                console.log(`${ui_1.C.gray}  ◦ Invalid selection — model unchanged.${ui_1.C.reset}\n`);
            }
            else {
                console.log(`${ui_1.C.gray}  ◦ Cancelled.${ui_1.C.reset}\n`);
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
        console.log(`${ui_1.C.gray}  ◦ Current think level: ${ui_1.C.reset}${ui_1.C.cyan}${cur}${ui_1.C.reset}\n`);
        return;
    }
    // 'on' is an alias for re-enabling reasoning at the default medium level
    if (level === 'on') {
        planner.setThinkLevel('medium');
        (0, github_copilot_1.saveModelSettings)(planner.getModel(), 'medium');
        console.log(`${ui_1.C.green}  ✓ Thinking enabled${ui_1.C.reset} (level: ${ui_1.C.cyan}medium${ui_1.C.reset})\n`);
        return;
    }
    if (level !== 'off' && level !== 'low' && level !== 'medium' && level !== 'high') {
        console.log(`${ui_1.C.red}  ✗ Invalid think level.${ui_1.C.reset} Use: ` +
            `${ui_1.C.cyan}off${ui_1.C.reset} | ${ui_1.C.cyan}on${ui_1.C.reset} | ${ui_1.C.cyan}low${ui_1.C.reset} | ${ui_1.C.cyan}medium${ui_1.C.reset} | ${ui_1.C.cyan}high${ui_1.C.reset}\n`);
        return;
    }
    planner.setThinkLevel(level);
    (0, github_copilot_1.saveModelSettings)(planner.getModel(), level);
    if (level === 'off') {
        console.log(`${ui_1.C.green}  ✓ Thinking disabled${ui_1.C.reset} (fast response mode)\n`);
    }
    else {
        console.log(`${ui_1.C.green}  ✓ Think level set to ${ui_1.C.reset}${ui_1.C.cyan}${level}${ui_1.C.reset}\n`);
    }
}
// ─── /memory ──────────────────────────────────────────────────────────────────
function handleMemoryCommand(input, memoryManager) {
    const parts = input.split(/\s+/);
    const sub = parts[1]?.toLowerCase();
    if (!sub || sub === 'list') {
        const entries = memoryManager.getAll();
        if (entries.length === 0) {
            console.log(`${ui_1.C.gray}  ◦ No memories stored.${ui_1.C.reset}\n`);
            return;
        }
        console.log(`\n${ui_1.C.cyan}  Stored memories:${ui_1.C.reset}\n`);
        for (const e of entries) {
            console.log(`  ${ui_1.C.cyan}${e.key}${ui_1.C.reset}  ${ui_1.C.gray}→${ui_1.C.reset}  ${e.value}`);
        }
        console.log();
        return;
    }
    if (sub === 'set') {
        const key = parts[2];
        const value = parts.slice(3).join(' ');
        if (!key || !value) {
            console.log(`${ui_1.C.red}  ✗ Usage:${ui_1.C.reset} /memory set <key> <value>\n`);
            return;
        }
        memoryManager.set(key, value);
        console.log(`${ui_1.C.green}  ✓ Memory saved:${ui_1.C.reset} ${ui_1.C.cyan}${key}${ui_1.C.reset}  =  ${value}\n`);
        return;
    }
    if (sub === 'delete' || sub === 'del') {
        const key = parts[2];
        if (!key) {
            console.log(`${ui_1.C.red}  ✗ Usage:${ui_1.C.reset} /memory delete <key>\n`);
            return;
        }
        if (memoryManager.delete(key)) {
            console.log(`${ui_1.C.green}  ✓ Memory deleted:${ui_1.C.reset} ${ui_1.C.cyan}${key}${ui_1.C.reset}\n`);
        }
        else {
            console.log(`${ui_1.C.gray}  ◦ No memory found with key: ${key}${ui_1.C.reset}\n`);
        }
        return;
    }
    if (sub === 'clear') {
        memoryManager.clear();
        console.log(`${ui_1.C.green}  ✓ All memories cleared.${ui_1.C.reset}\n`);
        return;
    }
    console.log(`${ui_1.C.red}  ✗ Unknown /memory subcommand.${ui_1.C.reset}\n` +
        '  Usage:\n' +
        '    /memory list\n' +
        '    /memory set <key> <value>\n' +
        '    /memory delete <key>\n' +
        '    /memory clear\n');
}
// ─── /update ──────────────────────────────────────────────────────────────────
async function handleUpdateCommand() {
    // The package root is one directory above dist/ (where __dirname points)
    const repoDir = path.resolve(path.join(__dirname, '..'));
    console.log(`\n${ui_1.C.cyan}  Updating IntelliCode…${ui_1.C.reset}\n`);
    const { executeCommand } = await Promise.resolve().then(() => __importStar(require('./tools/shell')));
    // Verify that repoDir is actually a git repository before running commands
    const gitCheck = await executeCommand('git rev-parse --is-inside-work-tree', repoDir, 5000);
    if (gitCheck.exitCode !== 0) {
        console.log(`${ui_1.C.red}  ✗ Cannot update:${ui_1.C.reset} The install directory is not a git repository.\n` +
            `  Directory: ${repoDir}\n` +
            '  To update, re-run the installation script instead.\n');
        return;
    }
    console.log(`${ui_1.C.gray}  → Fetching latest changes from remote…${ui_1.C.reset}`);
    const fetchResult = await executeCommand('git fetch --all', repoDir, 60000);
    if (fetchResult.exitCode !== 0) {
        console.log(`${ui_1.C.red}  ✗ git fetch failed${ui_1.C.reset}`);
        if (fetchResult.stderr)
            console.log(`    stderr: ${fetchResult.stderr}`);
        if (fetchResult.stdout)
            console.log(`    stdout: ${fetchResult.stdout}`);
        console.log();
        return;
    }
    console.log(`${ui_1.C.green}  ✓ Fetched latest remote changes${ui_1.C.reset}`);
    console.log(`${ui_1.C.gray}  → Syncing with origin/main (local build files will be overwritten)…${ui_1.C.reset}`);
    const resetResult = await executeCommand('git reset --hard origin/main', repoDir, 30000);
    if (resetResult.exitCode !== 0) {
        console.log(`${ui_1.C.red}  ✗ git reset failed${ui_1.C.reset}`);
        if (resetResult.stderr)
            console.log(`    stderr: ${resetResult.stderr}`);
        if (resetResult.stdout)
            console.log(`    stdout: ${resetResult.stdout}`);
        console.log();
        return;
    }
    const resetOutput = resetResult.stdout.trim() || 'HEAD is now up to date.';
    console.log(`${ui_1.C.green}  ✓ ${resetOutput}${ui_1.C.reset}`);
    console.log(`${ui_1.C.gray}  → Installing dependencies…${ui_1.C.reset}`);
    const installResult = await executeCommand('npm install', repoDir, 120000);
    if (installResult.exitCode !== 0) {
        console.log(`${ui_1.C.red}  ✗ npm install failed${ui_1.C.reset}`);
        if (installResult.stderr)
            console.log(`    stderr: ${installResult.stderr}`);
        if (installResult.stdout)
            console.log(`    stdout: ${installResult.stdout}`);
        console.log();
        return;
    }
    console.log(`${ui_1.C.green}  ✓ Dependencies installed${ui_1.C.reset}`);
    console.log(`${ui_1.C.gray}  → Rebuilding…${ui_1.C.reset}`);
    const buildResult = await executeCommand('npm run build', repoDir, 120000);
    if (buildResult.exitCode !== 0) {
        console.log(`${ui_1.C.red}  ✗ Build failed${ui_1.C.reset}`);
        if (buildResult.stderr)
            console.log(`    stderr: ${buildResult.stderr}`);
        if (buildResult.stdout)
            console.log(`    stdout: ${buildResult.stdout}`);
        console.log();
        return;
    }
    console.log(`${ui_1.C.green}  ✓ Build complete${ui_1.C.reset}`);
    console.log(`\n${ui_1.C.green}  ✓ IntelliCode updated successfully!${ui_1.C.reset} ` +
        `${ui_1.C.gray}Please restart intellicode to use the new version.${ui_1.C.reset}\n`);
}
async function handleMcpReplCommand(input, mcpManager) {
    const parts = input.split(/\s+/);
    const sub = parts[1]?.toLowerCase();
    if (sub === 'list') {
        const configs = mcpManager.getConfigs();
        if (configs.length === 0) {
            console.log(`${ui_1.C.gray}  ◦ No MCP servers configured.${ui_1.C.reset}\n`);
            return;
        }
        console.log(`\n${ui_1.C.cyan}  Configured MCP servers:${ui_1.C.reset}\n`);
        for (const c of configs) {
            const cmd = [c.command, ...(c.args ?? [])].join(' ');
            console.log(`  ${ui_1.C.cyan}${c.name}${ui_1.C.reset}  ${ui_1.C.gray}—${ui_1.C.reset}  ${cmd}`);
        }
        console.log();
        return;
    }
    if (sub === 'install') {
        const pkg = parts[2];
        if (!pkg) {
            console.log(`${ui_1.C.red}  ✗ Usage:${ui_1.C.reset} /mcp install <npm-package> [server-name]\n`);
            return;
        }
        const rawName = parts[3] ?? pkg.replace(/^@[^/]+\//, '').replace(/^server-/, '');
        // Sanitize: keep only alphanumeric, hyphens, underscores; fall back to 'mcp-server' if empty
        const name = rawName.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^-+|-+$/g, '') || 'mcp-server';
        console.log(`\n${ui_1.C.gray}  → Installing ${pkg}…${ui_1.C.reset}`);
        const { executeCommand } = await Promise.resolve().then(() => __importStar(require('./tools/shell')));
        const installResult = await executeCommand(`npm install -g ${pkg}`);
        if (installResult.exitCode !== 0) {
            console.log(`${ui_1.C.red}  ✗ Installation failed (exit ${installResult.exitCode}):${ui_1.C.reset}\n  ${installResult.stderr}\n`);
            return;
        }
        console.log(`${ui_1.C.green}  ✓ Package installed${ui_1.C.reset}`);
        try {
            await mcpManager.installAndStartServer({
                name,
                command: 'npx',
                args: ['-y', pkg],
                env: {},
            });
            console.log(`${ui_1.C.green}  ✓ MCP server ${ui_1.C.reset}${ui_1.C.cyan}${name}${ui_1.C.reset}${ui_1.C.green} started and registered${ui_1.C.reset}\n`);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.log(`${ui_1.C.red}  ✗ Server registered but failed to start: ${msg}${ui_1.C.reset}\n` +
                `${ui_1.C.gray}  It was saved to config — it will be retried on next launch.${ui_1.C.reset}\n`);
        }
        return;
    }
    console.log(`${ui_1.C.red}  ✗ Unknown /mcp subcommand.${ui_1.C.reset}\n` +
        '  Usage:\n    /mcp list\n    /mcp install <package> [name]\n');
}
// ─── /penpot ──────────────────────────────────────────────────────────────────
const PENPOT_SERVER_NAME = 'penpot';
const PENPOT_DEFAULT_BASE_URL = 'https://design.penpot.app';
async function handlePenpotCommand(input, mcpManager, memoryManager, rl) {
    const parts = input.split(/\s+/);
    const sub = parts[1]?.toLowerCase();
    if (!sub || sub === 'help') {
        console.log(`
${ui_1.C.cyan}  Penpot MCP Integration${ui_1.C.reset}

  Penpot is an open-source design tool. IntelliCode can connect to Penpot's
  MCP server and autonomously create UI/UX designs, then generate code.

${ui_1.C.cyan}  Commands:${ui_1.C.reset}
    /penpot connect   Guided Penpot MCP setup
    /penpot status    Show Penpot connection status
    /penpot help      Show this message

${ui_1.C.cyan}  Workflow:${ui_1.C.reset}
    1. Run ${ui_1.C.cyan}/penpot connect${ui_1.C.reset} and provide your Penpot access token.
    2. Ask the agent to design something, e.g.:
         ${ui_1.C.gray}"Design a login page and generate React code from the design"${ui_1.C.reset}
    3. The agent creates the design in Penpot, inspects it, and writes
       pixel-perfect code that matches your design.

${ui_1.C.cyan}  Get a Penpot token:${ui_1.C.reset}
    Log in at ${ui_1.C.cyanD}https://design.penpot.app${ui_1.C.reset} → Profile → Access tokens → New token
    ${ui_1.C.gray}(For self-hosted Penpot, use your own base URL.)${ui_1.C.reset}
`);
        return;
    }
    if (sub === 'status') {
        const configs = mcpManager.getConfigs();
        const penpot = configs.find((c) => c.name === PENPOT_SERVER_NAME);
        if (penpot) {
            const baseUrl = penpot.env?.['PENPOT_BASE_URL'] ?? PENPOT_DEFAULT_BASE_URL;
            console.log(`${ui_1.C.green}  ✓ Penpot MCP is configured${ui_1.C.reset}\n` +
                `  Base URL : ${ui_1.C.cyan}${baseUrl}${ui_1.C.reset}\n` +
                `  Token    : ${ui_1.C.gray}(stored)${ui_1.C.reset}\n`);
        }
        else {
            console.log(`${ui_1.C.yellow}  ⚠  Penpot MCP is not configured.${ui_1.C.reset}\n` +
                `  Run ${ui_1.C.cyan}/penpot connect${ui_1.C.reset} to set it up.\n`);
        }
        return;
    }
    if (sub === 'connect') {
        console.log(`\n${ui_1.C.cyan}  Penpot MCP Setup${ui_1.C.reset}\n`);
        // Try to load a previously stored token from long-term memory
        const storedToken = memoryManager.get('penpot_access_token');
        const storedBaseUrl = memoryManager.get('penpot_base_url') ?? PENPOT_DEFAULT_BASE_URL;
        let token = storedToken ?? '';
        let baseUrl = storedBaseUrl;
        await new Promise((resolve) => {
            const askBaseUrl = () => {
                rl.question(`${ui_1.C.gray}  Penpot base URL [${baseUrl}]:${ui_1.C.reset} `, (ans) => {
                    const trimmed = ans.trim();
                    if (trimmed)
                        baseUrl = trimmed;
                    askToken();
                });
            };
            const askToken = () => {
                // Don't reveal any characters of a stored token — just indicate one exists
                const hint = token ? `${ui_1.C.gray} [token already set — press Enter to keep]${ui_1.C.reset}` : '';
                rl.question(`${ui_1.C.gray}  Penpot access token${ui_1.C.reset}${hint}${ui_1.C.gray}:${ui_1.C.reset} `, (ans) => {
                    const trimmed = ans.trim();
                    if (trimmed)
                        token = trimmed;
                    resolve();
                });
            };
            askBaseUrl();
        });
        if (!token) {
            console.log(`${ui_1.C.red}  ✗ No token provided. Penpot setup cancelled.${ui_1.C.reset}\n`);
            return;
        }
        // Persist to long-term memory so future sessions reuse the credentials
        memoryManager.set('penpot_access_token', token);
        memoryManager.set('penpot_base_url', baseUrl);
        console.log(`${ui_1.C.gray}  → Starting Penpot MCP server…${ui_1.C.reset}`);
        // ── Prerequisite: ensure pnpm is installed ────────────────────────────
        const { executeCommand: execCmd } = await Promise.resolve().then(() => __importStar(require('./tools/shell')));
        const pnpmCheck = await execCmd(`${(0, manager_1.resolveCommand)('pnpm')} --version`, undefined, 5000);
        if (pnpmCheck.exitCode !== 0) {
            console.log(`${ui_1.C.gray}  → pnpm not found — installing automatically…${ui_1.C.reset}`);
            const pnpmInstall = await execCmd(`${(0, manager_1.resolveCommand)('npm')} install -g pnpm`, undefined, 60000);
            if (pnpmInstall.exitCode === 0) {
                console.log(`${ui_1.C.green}  ✓ pnpm installed${ui_1.C.reset}`);
            }
            else {
                console.log(`${ui_1.C.yellow}  ⚠  Could not install pnpm automatically — falling back to npx${ui_1.C.reset}`);
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
            console.log(`${ui_1.C.green}  ✓ Penpot MCP connected!${ui_1.C.reset}\n` +
                `  Base URL : ${ui_1.C.cyan}${baseUrl}${ui_1.C.reset}\n` +
                `\n${ui_1.C.gray}  You can now ask the agent to design UI/UX and it will use Penpot.${ui_1.C.reset}\n`);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.log(`${ui_1.C.red}  ✗ Failed to start Penpot MCP server: ${msg}${ui_1.C.reset}\n` +
                `${ui_1.C.gray}  The configuration was saved — it will be retried on the next launch.\n` +
                `  Make sure @penpot/mcp is accessible via npx (requires Node.js 18+).${ui_1.C.reset}\n`);
        }
        return;
    }
    console.log(`${ui_1.C.red}  ✗ Unknown /penpot subcommand.${ui_1.C.reset}\n` +
        '  Usage:\n    /penpot connect\n    /penpot status\n    /penpot help\n');
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
        console.error(`${ui_1.C.red}Error: ${msg}${ui_1.C.reset}`);
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
        console.error(`${ui_1.C.red}Authentication error: ${msg}${ui_1.C.reset}`);
        process.exit(1);
    }
}
function authLogout() {
    (0, github_copilot_1.logout)();
}
function authStatusCmd() {
    const status = (0, github_copilot_1.authStatus)();
    if (!status.loggedIn) {
        console.log(`${ui_1.C.red}  ✗ Not logged in.${ui_1.C.reset}\n` +
            `  Run ${ui_1.C.cyan}intellicode auth login${ui_1.C.reset} to authenticate.\n`);
        return;
    }
    console.log(`${ui_1.C.green}  ✓ Logged in to GitHub Copilot.${ui_1.C.reset}`);
    if (status.tokenExpiry) {
        console.log(`  Session token expires: ${status.tokenExpiry.toLocaleString()}`);
    }
    console.log(`  Config file: ${(0, github_copilot_1.getConfigPath)()}\n`);
}
// ─── MCP commands ──────────────────────────────────────────────────────────────
function mcpInit() {
    manager_1.McpManager.createSampleConfig();
    console.log(`\n  Edit ${ui_1.C.yellow}${manager_1.McpManager.getConfigPath()}${ui_1.C.reset} to add your MCP servers.\n`);
}
function mcpList() {
    const configPath = manager_1.McpManager.getConfigPath();
    try {
        if (!fs.existsSync(configPath)) {
            console.log(`${ui_1.C.gray}  No MCP config found. Run ${ui_1.C.reset}intellicode mcp init${ui_1.C.gray} to create one.${ui_1.C.reset}\n`);
            return;
        }
        const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        const servers = raw.servers ?? [];
        if (servers.length === 0) {
            console.log(`${ui_1.C.gray}  ◦ No MCP servers configured.${ui_1.C.reset}\n`);
            return;
        }
        console.log(`${ui_1.C.cyan}  Configured MCP servers (${configPath}):${ui_1.C.reset}\n`);
        for (const s of servers) {
            const cmd = [s.command, ...(s.args ?? [])].join(' ');
            console.log(`  ${ui_1.C.cyan}${s.name}${ui_1.C.reset}  ${ui_1.C.gray}—${ui_1.C.reset}  ${cmd}`);
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
            console.log(`${ui_1.C.yellow}  You are not logged in.${ui_1.C.reset}\n` +
                `  Run ${ui_1.C.cyan}intellicode auth login${ui_1.C.reset} first.\n`);
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
                process.stdout.write(`\n${ui_1.C.gray}  (Response stopped — press Ctrl+C again to exit)${ui_1.C.reset}\n\n`);
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
    console.error(`${ui_1.C.red}Fatal error: ${msg}${ui_1.C.reset}`);
    process.exit(1);
});
//# sourceMappingURL=index.js.map