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
async function runRepl(planner) {
    printBanner();
    console.log('\x1b[90mType your request and press Enter. Type \x1b[0m/exit\x1b[90m to quit,\x1b[0m /clear\x1b[90m to reset context.\x1b[0m\n');
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
        if (input === '/exit' || input === '/quit') {
            console.log('\nGoodbye!\n');
            rl.close();
            process.exit(0);
        }
        if (input === '/clear') {
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
        // Pause prompt while processing
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
\x1b[90mREPL commands:
  /clear     Clear conversation context
  /history   Show number of messages in context
  /exit      Quit intellicode
  /help      Show this help message\x1b[0m
`);
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
        const planner = new planner_1.Planner(mcpManager);
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
            await runRepl(planner);
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