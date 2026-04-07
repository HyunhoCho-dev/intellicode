"use strict";
/**
 * GitHub Copilot provider
 *
 * Implements:
 *  1. OAuth 2.0 Device Flow to obtain a GitHub access token.
 *  2. Copilot-internal session token retrieval (gho_ token).
 *  3. Chat completions API calls with streaming support.
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
exports.loginWithDeviceFlow = loginWithDeviceFlow;
exports.isLoggedIn = isLoggedIn;
exports.logout = logout;
exports.streamChatCompletion = streamChatCompletion;
exports.listModels = listModels;
exports.getConfigPath = getConfigPath;
exports.authStatus = authStatus;
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const https = __importStar(require("https"));
// ─── Constants ───────────────────────────────────────────────────────────────
/**
 * GitHub OAuth App client ID used for Device Flow authentication.
 * This is the public client ID for the GitHub Copilot integration used by
 * several open-source CLI tools (no secret required for Device Flow).
 */
const GITHUB_CLIENT_ID = 'Iv1.b507a08c87ecfe98';
const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const COPILOT_TOKEN_URL = 'https://api.github.com/copilot_internal/v2/token';
const COPILOT_CHAT_URL = 'https://api.githubcopilot.com/chat/completions';
/** Directory where intellicode stores config/tokens. */
const CONFIG_DIR = path.join(os.homedir(), '.intellicode');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
// ─── Config helpers ───────────────────────────────────────────────────────────
function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
        }
    }
    catch {
        // ignore parse errors; treat as empty config
    }
    return {};
}
function saveConfig(config) {
    if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), {
        mode: 0o600,
    });
}
// ─── HTTP helper ──────────────────────────────────────────────────────────────
function httpsRequest(url, options, body) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const reqOptions = {
            hostname: parsed.hostname,
            port: parsed.port || 443,
            path: parsed.pathname + parsed.search,
            ...options,
        };
        const req = https.request(reqOptions, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk.toString()));
            res.on('end', () => resolve({ status: res.statusCode ?? 0, data }));
        });
        req.on('error', reject);
        if (body)
            req.write(body);
        req.end();
    });
}
async function requestDeviceCode() {
    const body = `client_id=${GITHUB_CLIENT_ID}&scope=copilot`;
    const { data } = await httpsRequest(GITHUB_DEVICE_CODE_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
        },
    }, body);
    return JSON.parse(data);
}
async function pollForAccessToken(deviceCode, interval) {
    const body = `client_id=${GITHUB_CLIENT_ID}&device_code=${deviceCode}&grant_type=urn:ietf:params:oauth:grant-type:device_code`;
    // Device codes expire in 15 minutes; poll at most 200 times to be safe
    const MAX_POLLS = 200;
    for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
        await sleep(interval * 1000);
        const { data } = await httpsRequest(GITHUB_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'application/json',
            },
        }, body);
        const response = JSON.parse(data);
        if (response.access_token) {
            return response.access_token;
        }
        if (response.error === 'slow_down') {
            interval += 5;
        }
        else if (response.error === 'expired_token') {
            throw new Error('The device code expired. Please run `intellicode auth login` again.');
        }
        else if (response.error && response.error !== 'authorization_pending') {
            throw new Error(`Authentication failed: ${response.error_description ?? response.error}`);
        }
    }
    throw new Error('Timed out waiting for GitHub authorization. Please run `intellicode auth login` again.');
}
/** Public function: runs the full Device Flow and saves the token. */
async function loginWithDeviceFlow() {
    const deviceCode = await requestDeviceCode();
    console.log('\n┌─────────────────────────────────────────┐');
    console.log('│  GitHub Copilot — Device Authentication  │');
    console.log('└─────────────────────────────────────────┘');
    console.log(`\n  1. Open this URL in your browser:`);
    console.log(`     \x1b[36m${deviceCode.verification_uri}\x1b[0m`);
    console.log(`\n  2. Enter the code: \x1b[33m${deviceCode.user_code}\x1b[0m`);
    console.log(`\n  Waiting for authorization...\n`);
    const accessToken = await pollForAccessToken(deviceCode.device_code, deviceCode.interval);
    const config = loadConfig();
    config.github_token = accessToken;
    // Invalidate cached Copilot token when re-logging in
    delete config.copilot_token;
    delete config.copilot_token_expires_at;
    saveConfig(config);
    console.log('\x1b[32m✓ Authenticated successfully!\x1b[0m\n');
}
function isLoggedIn() {
    const config = loadConfig();
    return Boolean(config.github_token);
}
function logout() {
    saveConfig({});
    console.log('Logged out.');
}
async function getCopilotToken() {
    const config = loadConfig();
    if (!config.github_token) {
        throw new Error('Not authenticated. Run \x1b[33mintellicode auth login\x1b[0m first.');
    }
    // Use cached token if still valid (with 60-second buffer)
    if (config.copilot_token &&
        config.copilot_token_expires_at &&
        Date.now() / 1000 < config.copilot_token_expires_at - 60) {
        return config.copilot_token;
    }
    // Fetch a fresh Copilot session token
    const { status, data } = await httpsRequest(COPILOT_TOKEN_URL, {
        method: 'GET',
        headers: {
            Authorization: `token ${config.github_token}`,
            'User-Agent': 'intellicode/0.1.0',
            Accept: 'application/json',
        },
    });
    if (status !== 200) {
        throw new Error(`Failed to retrieve Copilot token (HTTP ${status}). ` +
            'Make sure your GitHub account has an active Copilot subscription.');
    }
    const tokenData = JSON.parse(data);
    config.copilot_token = tokenData.token;
    config.copilot_token_expires_at = tokenData.expires_at;
    saveConfig(config);
    return tokenData.token;
}
// ─── Chat Completions ──────────────────────────────────────────────────────────
const VSCODE_SESSION_ID = generateSessionId();
const VSCODE_MACHINE_ID = generateMachineId();
function generateSessionId() {
    return (Math.random().toString(36).substring(2) +
        Date.now().toString(36));
}
function generateMachineId() {
    return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}
/**
 * Stream a chat completion from the Copilot API.
 *
 * @param messages   Conversation history.
 * @param tools      Optional tool definitions (OpenAI function-calling format).
 * @param onChunk    Called with each text chunk as it arrives.
 * @returns          Full assembled response (content + tool_calls).
 */
async function streamChatCompletion(messages, tools, onChunk) {
    const copilotToken = await getCopilotToken();
    const requestBody = JSON.stringify({
        model: 'gpt-4o',
        messages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? 'auto' : undefined,
        stream: true,
        max_tokens: 4096,
        temperature: 0.1,
    });
    return new Promise((resolve, reject) => {
        const parsed = new URL(COPILOT_CHAT_URL);
        const options = {
            hostname: parsed.hostname,
            port: 443,
            path: parsed.pathname,
            method: 'POST',
            headers: {
                Authorization: `Bearer ${copilotToken}`,
                'Content-Type': 'application/json',
                'Editor-Version': 'vscode/1.90.0',
                'Editor-Plugin-Version': 'copilot-chat/0.16.1',
                'User-Agent': 'GitHubCopilotChat/0.16.1',
                'Vscode-Sessionid': VSCODE_SESSION_ID,
                'Vscode-Machineid': VSCODE_MACHINE_ID,
                'Openai-Intent': 'conversation-panel',
                'X-Request-Id': generateSessionId(),
            },
        };
        const req = https.request(options, (res) => {
            if (res.statusCode !== 200) {
                let errData = '';
                res.on('data', (c) => (errData += c.toString()));
                res.on('end', () => reject(new Error(`Copilot API error (HTTP ${res.statusCode}): ${errData}`)));
                return;
            }
            let buffer = '';
            let fullContent = '';
            // Accumulate tool call fragments indexed by their position
            const toolCallAccumulator = new Map();
            res.on('data', (chunk) => {
                buffer += chunk.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed === 'data: [DONE]')
                        continue;
                    if (!trimmed.startsWith('data: '))
                        continue;
                    try {
                        const json = JSON.parse(trimmed.slice(6));
                        const delta = json.choices[0]?.delta;
                        if (!delta)
                            continue;
                        // Text content
                        if (delta.content) {
                            fullContent += delta.content;
                            onChunk(delta.content);
                        }
                        // Tool call fragments
                        if (delta.tool_calls) {
                            for (const tc of delta.tool_calls) {
                                const existing = toolCallAccumulator.get(tc.index) ?? {
                                    id: '',
                                    name: '',
                                    arguments: '',
                                };
                                if (tc.id)
                                    existing.id = tc.id;
                                if (tc.function?.name)
                                    existing.name += tc.function.name;
                                if (tc.function?.arguments)
                                    existing.arguments += tc.function.arguments;
                                toolCallAccumulator.set(tc.index, existing);
                            }
                        }
                    }
                    catch {
                        // skip malformed SSE lines
                    }
                }
            });
            res.on('end', () => {
                const toolCalls = [];
                for (const [, tc] of toolCallAccumulator) {
                    toolCalls.push({
                        id: tc.id || generateSessionId(),
                        type: 'function',
                        function: { name: tc.name, arguments: tc.arguments },
                    });
                }
                resolve({ content: fullContent, tool_calls: toolCalls });
            });
            res.on('error', reject);
        });
        req.on('error', reject);
        req.write(requestBody);
        req.end();
    });
}
// ─── Utilities ────────────────────────────────────────────────────────────────
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/** Fetch available Copilot models (for diagnostics / future use). */
async function listModels() {
    const copilotToken = await getCopilotToken();
    const { status, data } = await httpsRequest('https://api.githubcopilot.com/models', {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${copilotToken}`,
            'Editor-Version': 'vscode/1.90.0',
            'User-Agent': 'GitHubCopilotChat/0.16.1',
        },
    });
    if (status !== 200)
        return ['gpt-4o', 'gpt-4', 'claude-3.5-sonnet'];
    try {
        const parsed = JSON.parse(data);
        return parsed.data.map((m) => m.id);
    }
    catch {
        return ['gpt-4o', 'gpt-4', 'claude-3.5-sonnet'];
    }
}
/** Return the path to the config file (used for diagnostic output). */
function getConfigPath() {
    return CONFIG_FILE;
}
/** Return whether there is a cached (possibly expired) Copilot token. */
function authStatus() {
    const config = loadConfig();
    if (!config.github_token)
        return { loggedIn: false };
    if (config.copilot_token_expires_at) {
        return {
            loggedIn: true,
            tokenExpiry: new Date(config.copilot_token_expires_at * 1000),
        };
    }
    return { loggedIn: true };
}
//# sourceMappingURL=github-copilot.js.map