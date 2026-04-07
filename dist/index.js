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
// ─── Banner ────────────────────────────────────────────────────────────────────
function printBanner() {
    console.log(`
\x1b[36m  ___       _       _ _ _  _____          _      
 |_ _|_ __ | |_ ___| | (_)/ ____|___   __| | ___ 
  | || '_ \\| __/ _ \\ | | | |   / _ \\ / _\` |/ _ \\
  | || | | | ||  __/ | | | |__| (_) | (_| |  __/
 |___|_| |_|\\__\\___|_|_|_|\\_____\\___/ \\__,_|\\___|
\x1b[0m`);
    console.log(`  \x1b[90mAI coding agent powered by GitHub Copilot  v${PKG_VERSION}\x1b[0m\n`);
}
// ─── REPL ──────────────────────────────────────────────────────────────────────
async function runRepl(planner, mcpManager) {
    printBanner();
    console.log('\x1b[90mType your request and press Enter. Type \x1b[0m/help\x1b[90m to see all commands.\x1b[0m\n');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: '\x1b[32m➜ intellicode\x1b[0m  ',
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
            console.log('\nGoodbye!\n');
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
            printStatus(planner, mcpManager);
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
        // ── /mcp command ─────────────────────────────────────────────────────────
        if (input.startsWith('/mcp')) {
            rl.pause();
            await handleMcpReplCommand(input, mcpManager);
            rl.resume();
            rl.prompt();
            return;
        }
        // ── Regular prompt ────────────────────────────────────────────────────────
        rl.pause();
        process.stdout.write('\n');
        try {
            await planner.run(input, (token) => {
                process.stdout.write(token);
            });
            process.stdout.write('\n\n');
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`\n\x1b[31mError: ${msg}\x1b[0m\n`);
        }
        rl.resume();
        rl.prompt();
    });
    rl.on('close', () => {
        console.log('\nGoodbye!\n');
        process.exit(0);
    });
}
function printReplHelp() {
    console.log(`
\x1b[36mAvailable REPL commands:\x1b[0m

  \x1b[33mConversation\x1b[0m
    /clear, /reset   Clear conversation context
    /history         Show number of messages in context
    /exit, /quit     Quit intellicode

  \x1b[33mModel & Reasoning\x1b[0m
    /models          List available models and select one interactively
    /think [level]   Set reasoning intensity: low | medium | high
                     (no argument shows current level)

  \x1b[33mMCP Servers\x1b[0m
    /mcp list        List configured and running MCP servers
    /mcp install <pkg> [name]
                     Install an npm MCP package and register it
                     Example: /mcp install @modelcontextprotocol/server-brave-search brave-search

  \x1b[33mInfo\x1b[0m
    /status          Show current model, think level and MCP servers
    /help            Show this help message
`);
}
// ─── /status ──────────────────────────────────────────────────────────────────
function printStatus(planner, mcpManager) {
    const configs = mcpManager.getConfigs();
    console.log(`
\x1b[36mIntelliCode status:\x1b[0m
  Model       : \x1b[33m${planner.getModel()}\x1b[0m
  Think level : \x1b[33m${planner.getThinkLevelDescription()}\x1b[0m
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
    console.log('\n\x1b[36mAvailable models:\x1b[0m\n');
    models.forEach((m, i) => {
        const marker = m === current ? '\x1b[32m✓\x1b[0m' : ' ';
        console.log(`  ${marker} \x1b[33m${i + 1}\x1b[0m. ${m}`);
    });
    console.log();
    return new Promise((resolve) => {
        rl.question(`\x1b[90mEnter number to select (current: ${current}), or press Enter to cancel:\x1b[0m `, (answer) => {
            const n = parseInt(answer.trim(), 10);
            if (!isNaN(n) && n >= 1 && n <= models.length) {
                const chosen = models[n - 1];
                planner.setModel(chosen);
                (0, github_copilot_1.saveModelSettings)(chosen, planner.getThinkLevel());
                console.log(`\x1b[32m✓ Model set to \x1b[33m${chosen}\x1b[32m\x1b[0m\n`);
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
        console.log(`\x1b[90mCurrent think level: \x1b[33m${cur}\x1b[0m\n`);
        return;
    }
    if (level !== 'low' && level !== 'medium' && level !== 'high') {
        console.log('\x1b[31mInvalid think level.\x1b[0m Use: \x1b[33mlow\x1b[0m | \x1b[33mmedium\x1b[0m | \x1b[33mhigh\x1b[0m\n');
        return;
    }
    planner.setThinkLevel(level);
    (0, github_copilot_1.saveModelSettings)(planner.getModel(), level);
    console.log(`\x1b[32m✓ Think level set to \x1b[33m${level}\x1b[0m\n`);
}
// ─── /mcp (REPL) ──────────────────────────────────────────────────────────────
async function handleMcpReplCommand(input, mcpManager) {
    const parts = input.split(/\s+/);
    const sub = parts[1]?.toLowerCase();
    if (sub === 'list') {
        const configs = mcpManager.getConfigs();
        if (configs.length === 0) {
            console.log('\x1b[90m(No MCP servers configured)\x1b[0m\n');
            return;
        }
        console.log('\n\x1b[36mConfigured MCP servers:\x1b[0m\n');
        for (const c of configs) {
            const cmd = [c.command, ...(c.args ?? [])].join(' ');
            console.log(`  \x1b[33m${c.name}\x1b[0m  —  ${cmd}`);
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
            console.log(`\x1b[32m✓ MCP server \x1b[33m${name}\x1b[32m started and registered\x1b[0m\n`);
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
// ─── Single-shot prompt ─────────────────────────────────────────────────────────
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
        console.log(`\x1b[36mConfigured MCP servers (${configPath}):\x1b[0m\n`);
        for (const s of servers) {
            const cmd = [s.command, ...(s.args ?? [])].join(' ');
            console.log(`  \x1b[33m${s.name}\x1b[0m  —  ${cmd}`);
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
                'Run \x1b[36mintellicode auth login\x1b[0m first.\n');
            process.exit(1);
        }
        // Start MCP servers
        const mcpManager = new manager_1.McpManager();
        await mcpManager.load();
        // Load persisted model & think level
        const { model, thinkLevel } = (0, github_copilot_1.loadModelSettings)();
        const planner = new planner_1.Planner(mcpManager, model, thinkLevel);
        // Graceful shutdown
        process.on('SIGINT', () => {
            mcpManager.shutdown();
            process.exit(0);
        });
        process.on('SIGTERM', () => {
            mcpManager.shutdown();
            process.exit(0);
        });
        if (prompt) {
            await runSinglePrompt(prompt, planner);
        }
        else {
            await runRepl(planner, mcpManager);
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