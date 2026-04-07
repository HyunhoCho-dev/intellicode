/**
 * Shell execution tools
 *
 * Allows the agent to run shell commands and capture stdout/stderr.
 * Defaults to PowerShell on Windows and bash on Unix-like systems.
 */

import * as child_process from 'child_process';
import * as os from 'os';
import * as path from 'path';

export interface ShellTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

const DEFAULT_TIMEOUT_MS = 30_000; // 30 seconds
const MAX_OUTPUT_CHARS = 20_000;

/** Detect the preferred shell for the current OS. */
function detectShell(): { shell: string; flag: string } {
  if (os.platform() === 'win32') {
    return { shell: 'powershell.exe', flag: '-Command' };
  }
  // Prefer bash, fall back to sh
  try {
    child_process.execSync('which bash', { stdio: 'ignore' });
    return { shell: 'bash', flag: '-c' };
  } catch {
    return { shell: 'sh', flag: '-c' };
  }
}

/**
 * Execute a shell command and return its output.
 *
 * @param command   Shell command to execute.
 * @param cwd       Working directory (defaults to process.cwd()).
 * @param timeout   Timeout in milliseconds (default: 30 s).
 */
export async function executeCommand(
  command: string,
  cwd?: string,
  timeout: number = DEFAULT_TIMEOUT_MS
): Promise<CommandResult> {
  const { shell, flag } = detectShell();
  const workingDir = cwd ? path.resolve(cwd) : process.cwd();

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const proc = child_process.spawn(shell, [flag, command], {
      cwd: workingDir,
      env: process.env,
      windowsHide: true,
    });

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
      if (stdout.length > MAX_OUTPUT_CHARS) {
        stdout = stdout.slice(-MAX_OUTPUT_CHARS);
      }
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
      if (stderr.length > MAX_OUTPUT_CHARS) {
        stderr = stderr.slice(-MAX_OUTPUT_CHARS);
      }
    });

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGTERM');
    }, timeout);

    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        stdout: stdout.trimEnd(),
        stderr: stderr.trimEnd(),
        exitCode: code ?? -1,
        timedOut,
      });
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        stdout: '',
        stderr: err.message,
        exitCode: -1,
        timedOut: false,
      });
    });
  });
}

/** Format a CommandResult as a string for the LLM. */
export function formatResult(result: CommandResult): string {
  const parts: string[] = [];

  if (result.timedOut) {
    parts.push('⚠️  Command timed out.');
  }

  parts.push(`Exit code: ${result.exitCode}`);

  if (result.stdout) {
    parts.push(`--- stdout ---\n${result.stdout}`);
  }
  if (result.stderr) {
    parts.push(`--- stderr ---\n${result.stderr}`);
  }
  if (!result.stdout && !result.stderr) {
    parts.push('(no output)');
  }

  return parts.join('\n');
}

// ─── Tool definitions for the agent ──────────────────────────────────────────

export const shellTools: ShellTool[] = [
  {
    name: 'execute_command',
    description:
      'Execute a shell command and return its stdout, stderr, and exit code. ' +
      'Use this to run tests, build code, install packages, or inspect the system. ' +
      'On Windows, commands are run through PowerShell. On Unix, they use bash/sh.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description:
            'The command to execute. For multi-line scripts use semicolons or newlines.',
        },
        cwd: {
          type: 'string',
          description:
            'Working directory in which to run the command. Defaults to the current directory.',
        },
        timeout: {
          type: 'number',
          description:
            'Maximum execution time in milliseconds. Defaults to 30000 (30 s).',
        },
      },
      required: ['command'],
    },
    execute: async (args) => {
      const result = await executeCommand(
        args['command'] as string,
        args['cwd'] as string | undefined,
        (args['timeout'] as number | undefined) ?? DEFAULT_TIMEOUT_MS
      );
      return formatResult(result);
    },
  },
];
