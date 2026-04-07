"use strict";
/**
 * Shell execution tools
 *
 * Allows the agent to run shell commands and capture stdout/stderr.
 * Defaults to PowerShell on Windows and bash on Unix-like systems.
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
exports.shellTools = void 0;
exports.executeCommand = executeCommand;
exports.formatResult = formatResult;
const child_process = __importStar(require("child_process"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const DEFAULT_TIMEOUT_MS = 30000; // 30 seconds
const MAX_OUTPUT_CHARS = 20000;
/** Detect the preferred shell for the current OS. */
function detectShell() {
    if (os.platform() === 'win32') {
        return { shell: 'powershell.exe', flag: '-Command' };
    }
    // Prefer bash, fall back to sh
    try {
        child_process.execSync('which bash', { stdio: 'ignore' });
        return { shell: 'bash', flag: '-c' };
    }
    catch {
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
async function executeCommand(command, cwd, timeout = DEFAULT_TIMEOUT_MS) {
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
        proc.stdout.on('data', (data) => {
            stdout += data.toString();
            if (stdout.length > MAX_OUTPUT_CHARS) {
                stdout = stdout.slice(-MAX_OUTPUT_CHARS);
            }
        });
        proc.stderr.on('data', (data) => {
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
function formatResult(result) {
    const parts = [];
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
exports.shellTools = [
    {
        name: 'execute_command',
        description: 'Execute a shell command and return its stdout, stderr, and exit code. ' +
            'Use this to run tests, build code, install packages, or inspect the system. ' +
            'On Windows, commands are run through PowerShell. On Unix, they use bash/sh.',
        parameters: {
            type: 'object',
            properties: {
                command: {
                    type: 'string',
                    description: 'The command to execute. For multi-line scripts use semicolons or newlines.',
                },
                cwd: {
                    type: 'string',
                    description: 'Working directory in which to run the command. Defaults to the current directory.',
                },
                timeout: {
                    type: 'number',
                    description: 'Maximum execution time in milliseconds. Defaults to 30000 (30 s).',
                },
            },
            required: ['command'],
        },
        execute: async (args) => {
            const result = await executeCommand(args['command'], args['cwd'], args['timeout'] ?? DEFAULT_TIMEOUT_MS);
            return formatResult(result);
        },
    },
];
//# sourceMappingURL=shell.js.map