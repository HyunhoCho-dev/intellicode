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
  listModels,
  saveModelSettings,
  loadModelSettings,
} from './providers/github-copilot';
import { Planner, ThinkLevel } from './agent/planner';
import { McpManager } from './mcp/manager';
import { MemoryManager } from './memory/manager';
import { SkillsManager } from './skills/manager';
import {
  C,
  printBanner,
  printWelcome,
  printHelp,
  printStatus,
  printSkillsSearch,
  printInstalledSkills,
  createThinkingSpinner,
  PROMPT,
} from './ui';

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

// ─── Active streaming state ────────────────────────────────────────────────────
// Shared between runRepl and the SIGINT handler registered in main().

/** Non-null while the agent is streaming a response. */
let activeAbortController: AbortController | null = null;



// ─── REPL ──────────────────────────────────────────────────────────────────────

async function runRepl(
  planner: Planner,
  mcpManager: McpManager,
  memoryManager: MemoryManager
): Promise<void> {
  printBanner(PKG_VERSION);
  printWelcome();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: PROMPT,
    terminal: true,
  });

  rl.prompt();

  rl.on('line', async (line: string) => {
    const input = line.trim();

    if (!input) {
      rl.prompt();
      return;
    }

    // ── Built-in REPL commands ──────────────────────────────────────────────

    if (input === '/exit' || input === '/quit') {
      console.log(`\n${C.cyan}  Goodbye!${C.reset}\n`);
      rl.close();
      process.exit(0);
    }

    if (input === '/clear' || input === '/reset') {
      planner.resetHistory();
      console.log(`${C.gray}  ◦ Conversation context cleared.${C.reset}\n`);
      rl.prompt();
      return;
    }

    if (input === '/history') {
      console.log(
        `${C.gray}  ◦ ${planner.historyLength} messages in context.${C.reset}\n`
      );
      rl.prompt();
      return;
    }

    if (input === '/help') {
      printHelp();
      rl.prompt();
      return;
    }

    if (input === '/status') {
      const configs = mcpManager.getConfigs();
      const skillsMgr = new SkillsManager(mcpManager);
      const installedSkills = skillsMgr.listInstalled();
      printStatus({
        model:      planner.getModel(),
        thinkLevel: planner.getThinkLevelDescription(),
        memories:   memoryManager.size,
        history:    planner.historyLength,
        mcpServers: configs.map((c) => c.name),
        skills:     installedSkills.map((s) => s.name),
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

    // ── /skills command ───────────────────────────────────────────────────────
    if (input.startsWith('/skills')) {
      rl.pause();
      await handleSkillsCommand(input, mcpManager, rl);
      rl.resume();
      rl.prompt();
      return;
    }

    // ── Regular prompt ────────────────────────────────────────────────────────
    rl.pause();
    process.stdout.write('\n');

    // Start the "Thinking…" spinner before the first token arrives
    const spinner = createThinkingSpinner();
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
      await planner.run(
        input,
        (token: string) => {
          stopSpinnerOnce();
          process.stdout.write(token);
        },
        signal,
      );
      stopSpinnerOnce();
      process.stdout.write('\n\n');
    } catch (err) {
      stopSpinnerOnce();
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`\n${C.red}  ✗ Error: ${msg}${C.reset}\n`);
    } finally {
      activeAbortController = null;
    }

    rl.resume();
    rl.prompt();
  });

  rl.on('close', () => {
    console.log(`\n${C.cyan}  Goodbye!${C.reset}\n`);
    process.exit(0);
  });
}

// ─── /models ──────────────────────────────────────────────────────────────────

async function handleModelsCommand(
  planner: Planner,
  rl: readline.Interface
): Promise<void> {
  console.log(`\n${C.gray}  Fetching available models…${C.reset}`);
  let models: string[];
  try {
    models = await listModels();
  } catch {
    console.warn(`${C.yellow}  ⚠  Could not fetch models from API — showing defaults${C.reset}`);
    models = ['gpt-4o', 'gpt-4', 'claude-3.5-sonnet'];
  }

  const current = planner.getModel();
  console.log(`\n${C.cyan}  Available models:${C.reset}\n`);
  models.forEach((m, i) => {
    const marker = m === current ? `${C.green}✓${C.reset}` : ' ';
    console.log(`  ${marker} ${C.cyan}${i + 1}${C.reset}. ${m}`);
  });
  console.log();

  return new Promise<void>((resolve) => {
    rl.question(
      `${C.gray}  Enter number to select (current: ${current}), or press Enter to cancel:${C.reset} `,
      (answer) => {
        const n = parseInt(answer.trim(), 10);
        if (!isNaN(n) && n >= 1 && n <= models.length) {
          const chosen = models[n - 1];
          planner.setModel(chosen);
          saveModelSettings(chosen, planner.getThinkLevel());
          console.log(`${C.green}  ✓ Model set to ${C.reset}${C.cyan}${chosen}${C.reset}\n`);
        } else if (answer.trim() !== '') {
          console.log(`${C.gray}  ◦ Invalid selection — model unchanged.${C.reset}\n`);
        } else {
          console.log(`${C.gray}  ◦ Cancelled.${C.reset}\n`);
        }
        resolve();
      }
    );
  });
}

// ─── /think ───────────────────────────────────────────────────────────────────

function handleThinkCommand(input: string, planner: Planner): void {
  const parts = input.split(/\s+/);
  const level = parts[1]?.toLowerCase();

  if (!level) {
    const cur = planner.getThinkLevel();
    console.log(`${C.gray}  ◦ Current think level: ${C.reset}${C.cyan}${cur}${C.reset}\n`);
    return;
  }

  // 'on' is an alias for re-enabling reasoning at the default medium level
  if (level === 'on') {
    planner.setThinkLevel('medium');
    saveModelSettings(planner.getModel(), 'medium');
    console.log(`${C.green}  ✓ Thinking enabled${C.reset} (level: ${C.cyan}medium${C.reset})\n`);
    return;
  }

  if (level !== 'off' && level !== 'low' && level !== 'medium' && level !== 'high') {
    console.log(
      `${C.red}  ✗ Invalid think level.${C.reset} Use: ` +
        `${C.cyan}off${C.reset} | ${C.cyan}on${C.reset} | ${C.cyan}low${C.reset} | ${C.cyan}medium${C.reset} | ${C.cyan}high${C.reset}\n`
    );
    return;
  }

  planner.setThinkLevel(level as ThinkLevel);
  saveModelSettings(planner.getModel(), level);
  if (level === 'off') {
    console.log(`${C.green}  ✓ Thinking disabled${C.reset} (fast response mode)\n`);
  } else {
    console.log(`${C.green}  ✓ Think level set to ${C.reset}${C.cyan}${level}${C.reset}\n`);
  }
}

// ─── /memory ──────────────────────────────────────────────────────────────────

function handleMemoryCommand(
  input: string,
  memoryManager: MemoryManager
): void {
  const parts = input.split(/\s+/);
  const sub = parts[1]?.toLowerCase();

  if (!sub || sub === 'list') {
    const entries = memoryManager.getAll();
    if (entries.length === 0) {
      console.log(`${C.gray}  ◦ No memories stored.${C.reset}\n`);
      return;
    }
    console.log(`\n${C.cyan}  Stored memories:${C.reset}\n`);
    for (const e of entries) {
      console.log(`  ${C.cyan}${e.key}${C.reset}  ${C.gray}→${C.reset}  ${e.value}`);
    }
    console.log();
    return;
  }

  if (sub === 'set') {
    const key = parts[2];
    const value = parts.slice(3).join(' ');
    if (!key || !value) {
      console.log(`${C.red}  ✗ Usage:${C.reset} /memory set <key> <value>\n`);
      return;
    }
    memoryManager.set(key, value);
    console.log(`${C.green}  ✓ Memory saved:${C.reset} ${C.cyan}${key}${C.reset}  =  ${value}\n`);
    return;
  }

  if (sub === 'delete' || sub === 'del') {
    const key = parts[2];
    if (!key) {
      console.log(`${C.red}  ✗ Usage:${C.reset} /memory delete <key>\n`);
      return;
    }
    if (memoryManager.delete(key)) {
      console.log(`${C.green}  ✓ Memory deleted:${C.reset} ${C.cyan}${key}${C.reset}\n`);
    } else {
      console.log(`${C.gray}  ◦ No memory found with key: ${key}${C.reset}\n`);
    }
    return;
  }

  if (sub === 'clear') {
    memoryManager.clear();
    console.log(`${C.green}  ✓ All memories cleared.${C.reset}\n`);
    return;
  }

  console.log(
    `${C.red}  ✗ Unknown /memory subcommand.${C.reset}\n` +
      '  Usage:\n' +
      '    /memory list\n' +
      '    /memory set <key> <value>\n' +
      '    /memory delete <key>\n' +
      '    /memory clear\n'
  );
}

// ─── /update ──────────────────────────────────────────────────────────────────

async function handleUpdateCommand(): Promise<void> {
  // The package root is one directory above dist/ (where __dirname points)
  const repoDir = path.resolve(path.join(__dirname, '..'));
  console.log(`\n${C.cyan}  Updating IntelliCode…${C.reset}\n`);

  const { executeCommand } = await import('./tools/shell');

  // Verify that repoDir is actually a git repository before running commands
  const gitCheck = await executeCommand('git rev-parse --is-inside-work-tree', repoDir, 5_000);
  if (gitCheck.exitCode !== 0) {
    console.log(
      `${C.red}  ✗ Cannot update:${C.reset} The install directory is not a git repository.\n` +
        `  Directory: ${repoDir}\n` +
        '  To update, re-run the installation script instead.\n'
    );
    return;
  }

  console.log(`${C.gray}  → Fetching latest changes from remote…${C.reset}`);
  const fetchResult = await executeCommand('git fetch --all', repoDir, 60_000);
  if (fetchResult.exitCode !== 0) {
    console.log(`${C.red}  ✗ git fetch failed${C.reset}`);
    if (fetchResult.stderr) console.log(`    stderr: ${fetchResult.stderr}`);
    if (fetchResult.stdout) console.log(`    stdout: ${fetchResult.stdout}`);
    console.log();
    return;
  }
  console.log(`${C.green}  ✓ Fetched latest remote changes${C.reset}`);

  console.log(`${C.gray}  → Syncing with origin/main (local build files will be overwritten)…${C.reset}`);
  const resetResult = await executeCommand('git reset --hard origin/main', repoDir, 30_000);
  if (resetResult.exitCode !== 0) {
    console.log(`${C.red}  ✗ git reset failed${C.reset}`);
    if (resetResult.stderr) console.log(`    stderr: ${resetResult.stderr}`);
    if (resetResult.stdout) console.log(`    stdout: ${resetResult.stdout}`);
    console.log();
    return;
  }
  const resetOutput = resetResult.stdout.trim() || 'HEAD is now up to date.';
  console.log(`${C.green}  ✓ ${resetOutput}${C.reset}`);

  console.log(`${C.gray}  → Installing dependencies…${C.reset}`);
  const installResult = await executeCommand('npm install', repoDir, 120_000);
  if (installResult.exitCode !== 0) {
    console.log(`${C.red}  ✗ npm install failed${C.reset}`);
    if (installResult.stderr) console.log(`    stderr: ${installResult.stderr}`);
    if (installResult.stdout) console.log(`    stdout: ${installResult.stdout}`);
    console.log();
    return;
  }
  console.log(`${C.green}  ✓ Dependencies installed${C.reset}`);

  console.log(`${C.gray}  → Rebuilding…${C.reset}`);
  const buildResult = await executeCommand('npm run build', repoDir, 120_000);
  if (buildResult.exitCode !== 0) {
    console.log(`${C.red}  ✗ Build failed${C.reset}`);
    if (buildResult.stderr) console.log(`    stderr: ${buildResult.stderr}`);
    if (buildResult.stdout) console.log(`    stdout: ${buildResult.stdout}`);
    console.log();
    return;
  }
  console.log(`${C.green}  ✓ Build complete${C.reset}`);

  console.log(
    `\n${C.green}  ✓ IntelliCode updated successfully!${C.reset} ` +
      `${C.gray}Please restart intellicode to use the new version.${C.reset}\n`
  );
}



async function handleMcpReplCommand(
  input: string,
  mcpManager: McpManager
): Promise<void> {
  const parts = input.split(/\s+/);
  const sub = parts[1]?.toLowerCase();

  if (sub === 'list') {
    const configs = mcpManager.getConfigs();
    if (configs.length === 0) {
      console.log(`${C.gray}  ◦ No MCP servers configured.${C.reset}\n`);
      return;
    }
    console.log(`\n${C.cyan}  Configured MCP servers:${C.reset}\n`);
    for (const c of configs) {
      const cmd = [c.command, ...(c.args ?? [])].join(' ');
      console.log(`  ${C.cyan}${c.name}${C.reset}  ${C.gray}—${C.reset}  ${cmd}`);
    }
    console.log();
    return;
  }

  if (sub === 'install') {
    const pkg = parts[2];
    if (!pkg) {
      console.log(
        `${C.red}  ✗ Usage:${C.reset} /mcp install <npm-package> [server-name]\n`
      );
      return;
    }
    const rawName = parts[3] ?? pkg.replace(/^@[^/]+\//, '').replace(/^server-/, '');
    // Sanitize: keep only alphanumeric, hyphens, underscores; fall back to 'mcp-server' if empty
    const name = rawName.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^-+|-+$/g, '') || 'mcp-server';
    console.log(`\n${C.gray}  → Installing ${pkg}…${C.reset}`);

    const { executeCommand } = await import('./tools/shell');
    const installResult = await executeCommand(`npm install -g ${pkg}`);
    if (installResult.exitCode !== 0) {
      console.log(
        `${C.red}  ✗ Installation failed (exit ${installResult.exitCode}):${C.reset}\n  ${installResult.stderr}\n`
      );
      return;
    }
    console.log(`${C.green}  ✓ Package installed${C.reset}`);

    try {
      await mcpManager.installAndStartServer({
        name,
        command: 'npx',
        args: ['-y', pkg],
        env: {},
      });
      console.log(`${C.green}  ✓ MCP server ${C.reset}${C.cyan}${name}${C.reset}${C.green} started and registered${C.reset}\n`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(
        `${C.red}  ✗ Server registered but failed to start: ${msg}${C.reset}\n` +
          `${C.gray}  It was saved to config — it will be retried on next launch.${C.reset}\n`
      );
    }
    return;
  }

  console.log(
    `${C.red}  ✗ Unknown /mcp subcommand.${C.reset}\n` +
      '  Usage:\n    /mcp list\n    /mcp install <package> [name]\n'
  );
}

// ─── /skills ──────────────────────────────────────────────────────────────────

async function handleSkillsCommand(
  input: string,
  mcpManager: McpManager,
  rl: readline.Interface
): Promise<void> {
  const parts = input.split(/\s+/);
  const sub = parts[1]?.toLowerCase();
  const skillsMgr = new SkillsManager(mcpManager);

  // ── /skills list ──
  if (!sub || sub === 'list') {
    const skills = skillsMgr.listInstalled();
    printInstalledSkills(skills);
    return;
  }

  // ── /skills search <query> ──
  if (sub === 'search') {
    const query = parts.slice(2).join(' ').trim();
    if (!query) {
      console.log(`${C.red}  ✗ Usage:${C.reset} /skills search <query>\n`);
      return;
    }
    console.log(`\n${C.gray}  → Searching Smithery registry for "${query}"…${C.reset}`);
    try {
      const results = await skillsMgr.search(query, 10);
      printSkillsSearch(results, `Search: "${query}"`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`${C.red}  ✗ Search failed: ${msg}${C.reset}\n`);
    }
    return;
  }

  // ── /skills popular ──
  if (sub === 'popular') {
    console.log(`\n${C.gray}  → Fetching popular skills from Smithery…${C.reset}`);
    try {
      const results = await skillsMgr.listPopular(12);
      printSkillsSearch(results, 'Popular Skills');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`${C.red}  ✗ Could not fetch popular skills: ${msg}${C.reset}\n`);
    }
    return;
  }

  // ── /skills add <qualifiedName> [localName] ──
  if (sub === 'add') {
    const qualifiedName = parts[2];
    if (!qualifiedName) {
      console.log(`${C.red}  ✗ Usage:${C.reset} /skills add <qualifiedName> [localName]\n`);
      return;
    }
    // Derive a sensible default local name from the qualified name
    const defaultName = qualifiedName
      .replace(/^@[^/]+\//, '')
      .replace(/^server-/, '')
      .replace(/[^a-z0-9_-]/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      || 'skill';
    const localName = parts[3] ?? defaultName;

    console.log(`\n${C.gray}  → Installing skill ${C.reset}${C.cyan}${qualifiedName}${C.reset}${C.gray} as "${localName}"…${C.reset}`);
    try {
      await skillsMgr.install(qualifiedName, localName);
      console.log(
        `${C.green}  ✓ Skill ${C.reset}${C.cyan}${localName}${C.reset}${C.green} installed!${C.reset}\n` +
        `${C.gray}  Use the agent to invoke it, or ask: "use the ${localName} skill to…"${C.reset}\n`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(
        `${C.red}  ✗ Failed to start skill: ${msg}${C.reset}\n` +
        `${C.gray}  Config was saved — it will be retried on next launch.${C.reset}\n`
      );
    }
    return;
  }

  // ── /skills remove <localName> ──
  if (sub === 'remove' || sub === 'rm' || sub === 'uninstall') {
    const localName = parts[2];
    if (!localName) {
      console.log(`${C.red}  ✗ Usage:${C.reset} /skills remove <name>\n`);
      return;
    }
    const removed = skillsMgr.remove(localName);
    if (removed) {
      console.log(`${C.green}  ✓ Skill "${localName}" removed.${C.reset}\n`);
    } else {
      console.log(`${C.gray}  ◦ No skill named "${localName}" found.${C.reset}\n`);
    }
    return;
  }

  // ── /skills create <name> ──
  if (sub === 'create' || sub === 'new') {
    const skillName = parts.slice(2).join(' ').trim();
    if (!skillName) {
      console.log(`${C.red}  ✗ Usage:${C.reset} /skills create <name>\n`);
      return;
    }

    console.log(`\n${C.cyan}  Create New Skill${C.reset}\n`);

    // Interactive prompts
    const description = await new Promise<string>((resolve) => {
      rl.question(
        `${C.gray}  Description (optional):${C.reset} `,
        (ans) => resolve(ans.trim())
      );
    });

    const defaultDir = path.join(process.cwd(), skillName.toLowerCase().replace(/[^a-z0-9-]/g, '-'));
    const outputDir = await new Promise<string>((resolve) => {
      rl.question(
        `${C.gray}  Output directory [${defaultDir}]:${C.reset} `,
        (ans) => resolve(ans.trim() || defaultDir)
      );
    });

    try {
      skillsMgr.scaffold(skillName, description, outputDir);
      console.log(
        `\n${C.green}  ✓ Skill scaffolded at:${C.reset} ${C.cyan}${outputDir}${C.reset}\n` +
        `\n${C.gray}  Next steps:${C.reset}\n` +
        `    ${C.cyan}cd ${outputDir}${C.reset}\n` +
        `    ${C.cyan}npm install${C.reset}\n` +
        `    ${C.cyan}npm run build${C.reset}\n` +
        `\n${C.gray}  Edit ${C.reset}src/index.ts${C.gray} to add your tools, then:${C.reset}\n` +
        `    ${C.cyan}/skills add ./${path.basename(outputDir)} ${skillName.toLowerCase().replace(/\s+/g, '-')}${C.reset}\n`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`${C.red}  ✗ Scaffold failed: ${msg}${C.reset}\n`);
    }
    return;
  }

  console.log(
    `${C.red}  ✗ Unknown /skills subcommand.${C.reset}\n` +
      '  Usage:\n' +
      '    /skills list\n' +
      '    /skills search <query>\n' +
      '    /skills popular\n' +
      '    /skills add <qualifiedName> [localName]\n' +
      '    /skills remove <name>\n' +
      '    /skills create <name>\n'
  );
}

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
    console.error(`${C.red}Error: ${msg}${C.reset}`);
    process.exit(1);
  }
}

// ─── Auth commands ────────────────────────────────────────────────────────────

async function authLogin(): Promise<void> {
  try {
    await loginWithDeviceFlow();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${C.red}Authentication error: ${msg}${C.reset}`);
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
      `${C.red}  ✗ Not logged in.${C.reset}\n` +
        `  Run ${C.cyan}intellicode auth login${C.reset} to authenticate.\n`
    );
    return;
  }
  console.log(`${C.green}  ✓ Logged in to GitHub Copilot.${C.reset}`);
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
    `\n  Edit ${C.yellow}${McpManager.getConfigPath()}${C.reset} to add your MCP servers.\n`
  );
}

function mcpList(): void {
  const configPath = McpManager.getConfigPath();
  try {
    if (!fs.existsSync(configPath)) {
      console.log(
        `${C.gray}  No MCP config found. Run ${C.reset}intellicode mcp init${C.gray} to create one.${C.reset}\n`
      );
      return;
    }
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
      servers?: Array<{ name: string; command: string; args?: string[] }>;
    };
    const servers = raw.servers ?? [];
    if (servers.length === 0) {
      console.log(`${C.gray}  ◦ No MCP servers configured.${C.reset}\n`);
      return;
    }
    console.log(`${C.cyan}  Configured MCP servers (${configPath}):${C.reset}\n`);
    for (const s of servers) {
      const cmd = [s.command, ...(s.args ?? [])].join(' ');
      console.log(`  ${C.cyan}${s.name}${C.reset}  ${C.gray}—${C.reset}  ${cmd}`);
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
          `${C.yellow}  You are not logged in.${C.reset}\n` +
            `  Run ${C.cyan}intellicode auth login${C.reset} first.\n`
        );
        process.exit(1);
      }

      // Start MCP servers
      const mcpManager = new McpManager();
      await mcpManager.load();

      // Load persisted model & think level
      const { model, thinkLevel } = loadModelSettings();

      // Load long-term memory
      const memoryManager = new MemoryManager();

      const planner = new Planner(
        mcpManager,
        memoryManager,
        model,
        thinkLevel as ThinkLevel
      );

      // Graceful shutdown — Ctrl+C aborts an in-progress response; a second
      // Ctrl+C (when nothing is streaming) exits the process.
      process.on('SIGINT', () => {
        if (activeAbortController) {
          // Abort the current streaming request instead of exiting
          activeAbortController.abort();
          // activeAbortController is cleared by the finally block in runRepl
          process.stdout.write(
            `\n${C.gray}  (Response stopped — press Ctrl+C again to exit)${C.reset}\n\n`
          );
        } else {
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
      } else {
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
  console.error(`${C.red}Fatal error: ${msg}${C.reset}`);
  process.exit(1);
});
