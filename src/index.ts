#!/usr/bin/env node
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

import * as readline from 'readline';
import * as path from 'path';
import * as fs from 'fs';
import { Command } from 'commander';

import {
  loginWithDeviceFlow,
  logout,
  isLoggedIn,
  authStatus,
  getConfigPath,
} from './providers/github-copilot';
import { Planner } from './agent/planner';
import { McpManager } from './mcp/manager';

// ─── Package metadata ──────────────────────────────────────────────────────────

const PKG_PATH = path.join(__dirname, '..', 'package.json');
let PKG_VERSION = '0.1.0';
try {
  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf-8')) as {
    version: string;
  };
  PKG_VERSION = pkg.version;
} catch {
  // use default
}

// ─── Banner ────────────────────────────────────────────────────────────────────

function printBanner(): void {
  console.log(`
\x1b[36m  ___       _       _ _ _  _____          _      
 |_ _|_ __ | |_ ___| | (_)/ ____|___   __| | ___ 
  | || '_ \\| __/ _ \\ | | | |   / _ \\ / _\` |/ _ \\
  | || | | | ||  __/ | | | |__| (_) | (_| |  __/
 |___|_| |_|\\__\\___|_|_|_|\\_____\\___/ \\__,_|\\___|
\x1b[0m`);
  console.log(
    `  \x1b[90mAI coding agent powered by GitHub Copilot  v${PKG_VERSION}\x1b[0m\n`
  );
}

// ─── REPL ──────────────────────────────────────────────────────────────────────

async function runRepl(planner: Planner): Promise<void> {
  printBanner();
  console.log(
    '\x1b[90mType your request and press Enter. Type \x1b[0m/exit\x1b[90m to quit,\x1b[0m /clear\x1b[90m to reset context.\x1b[0m\n'
  );

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\x1b[32m➜ intellicode\x1b[0m  ',
    terminal: true,
  });

  rl.prompt();

  rl.on('line', async (line: string) => {
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
      console.log(
        `\x1b[90m(${planner.historyLength} messages in context)\x1b[0m\n`
      );
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
      await planner.run(input, (token: string) => {
        process.stdout.write(token);
      });
      process.stdout.write('\n\n');
    } catch (err) {
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

function printReplHelp(): void {
  console.log(`
\x1b[90mREPL commands:
  /clear     Clear conversation context
  /history   Show number of messages in context
  /exit      Quit intellicode
  /help      Show this help message\x1b[0m
`);
}

// ─── Single-shot prompt ─────────────────────────────────────────────────────────

async function runSinglePrompt(
  prompt: string,
  planner: Planner
): Promise<void> {
  try {
    await planner.run(prompt, (token: string) => {
      process.stdout.write(token);
    });
    process.stdout.write('\n');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\x1b[31mError: ${msg}\x1b[0m`);
    process.exit(1);
  }
}

// ─── Auth commands ────────────────────────────────────────────────────────────

async function authLogin(): Promise<void> {
  try {
    await loginWithDeviceFlow();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\x1b[31mAuthentication error: ${msg}\x1b[0m`);
    process.exit(1);
  }
}

function authLogout(): void {
  logout();
}

function authStatusCmd(): void {
  const status = authStatus();
  if (!status.loggedIn) {
    console.log(
      '\x1b[31m✗ Not logged in.\x1b[0m\n' +
        'Run \x1b[33mintellicode auth login\x1b[0m to authenticate.\n'
    );
    return;
  }
  console.log('\x1b[32m✓ Logged in to GitHub Copilot.\x1b[0m');
  if (status.tokenExpiry) {
    console.log(
      `  Session token expires: ${status.tokenExpiry.toLocaleString()}`
    );
  }
  console.log(`  Config file: ${getConfigPath()}\n`);
}

// ─── MCP commands ──────────────────────────────────────────────────────────────

function mcpInit(): void {
  McpManager.createSampleConfig();
  console.log(
    `\nEdit \x1b[33m${McpManager.getConfigPath()}\x1b[0m to add your MCP servers.\n`
  );
}

function mcpList(): void {
  const configPath = McpManager.getConfigPath();
  try {
    if (!fs.existsSync(configPath)) {
      console.log(
        '\x1b[90mNo MCP config found. Run \x1b[0mintellicode mcp init\x1b[90m to create one.\x1b[0m\n'
      );
      return;
    }
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
      servers?: Array<{ name: string; command: string; args?: string[] }>;
    };
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Failed to read MCP config: ${msg}`);
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const program = new Command();

  program
    .name('intellicode')
    .description(
      'AI coding agent powered by GitHub Copilot — works in PowerShell'
    )
    .version(PKG_VERSION, '-v, --version')
    .argument('[prompt]', 'Optional prompt for single-shot mode')
    .action(async (prompt?: string) => {
      // Guard: must be authenticated for agent features
      if (!isLoggedIn()) {
        console.log(
          '\x1b[33mYou are not logged in.\x1b[0m\n' +
            'Run \x1b[36mintellicode auth login\x1b[0m first.\n'
        );
        process.exit(1);
      }

      // Start MCP servers
      const mcpManager = new McpManager();
      await mcpManager.load();

      const planner = new Planner(mcpManager);

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
      } else {
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
