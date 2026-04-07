/**
 * GitHub Copilot provider
 *
 * Implements:
 *  1. OAuth 2.0 Device Flow to obtain a GitHub access token.
 *  2. Copilot-internal session token retrieval (gho_ token).
 *  3. Chat completions API calls with streaming support.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { IncomingMessage } from 'http';

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * GitHub OAuth App client ID used for Device Flow authentication.
 * This is the public client ID for the GitHub Copilot integration used by
 * several open-source CLI tools (no secret required for Device Flow).
 */
const GITHUB_CLIENT_ID = 'Iv1.b507a08c87ecfe98';
const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const COPILOT_TOKEN_URL =
  'https://api.github.com/copilot_internal/v2/token';
const COPILOT_CHAT_URL =
  'https://api.githubcopilot.com/chat/completions';

/** Directory where intellicode stores config/tokens. */
const CONFIG_DIR = path.join(os.homedir(), '.intellicode');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
  name?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatCompletionChunk {
  choices: Array<{
    delta: {
      content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason: string | null;
  }>;
}

export interface ChatCompletionResponse {
  content: string;
  tool_calls: ToolCall[];
}

interface Config {
  github_token?: string;
  copilot_token?: string;
  copilot_token_expires_at?: number;
  selected_model?: string;
  think_level?: string;
}

// ─── Config helpers ───────────────────────────────────────────────────────────

function loadConfig(): Config {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')) as Config;
    }
  } catch {
    // ignore parse errors; treat as empty config
  }
  return {};
}

function saveConfig(config: Config): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), {
    mode: 0o600,
  });
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

function httpsRequest(
  url: string,
  options: https.RequestOptions,
  body?: string
): Promise<{ status: number; data: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqOptions: https.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      ...options,
    };

    const req = https.request(reqOptions, (res: IncomingMessage) => {
      let data = '';
      res.on('data', (chunk: Buffer) => (data += chunk.toString()));
      res.on('end', () =>
        resolve({ status: res.statusCode ?? 0, data })
      );
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ─── Device Flow Authentication ───────────────────────────────────────────────

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

async function requestDeviceCode(): Promise<DeviceCodeResponse> {
  const body = `client_id=${GITHUB_CLIENT_ID}&scope=copilot`;
  const { data } = await httpsRequest(
    GITHUB_DEVICE_CODE_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    },
    body
  );
  return JSON.parse(data) as DeviceCodeResponse;
}

interface AccessTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

async function pollForAccessToken(
  deviceCode: string,
  interval: number
): Promise<string> {
  const body = `client_id=${GITHUB_CLIENT_ID}&device_code=${deviceCode}&grant_type=urn:ietf:params:oauth:grant-type:device_code`;

  // Device codes expire in 15 minutes; poll at most 200 times to be safe
  const MAX_POLLS = 200;
  for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
    await sleep(interval * 1000);
    const { data } = await httpsRequest(
      GITHUB_TOKEN_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
      },
      body
    );

    const response = JSON.parse(data) as AccessTokenResponse;
    if (response.access_token) {
      return response.access_token;
    }
    if (response.error === 'slow_down') {
      interval += 5;
    } else if (response.error === 'expired_token') {
      throw new Error(
        'The device code expired. Please run `intellicode auth login` again.'
      );
    } else if (response.error && response.error !== 'authorization_pending') {
      throw new Error(
        `Authentication failed: ${response.error_description ?? response.error}`
      );
    }
  }

  throw new Error(
    'Timed out waiting for GitHub authorization. Please run `intellicode auth login` again.'
  );
}

/** Public function: runs the full Device Flow and saves the token. */
export async function loginWithDeviceFlow(): Promise<void> {
  const deviceCode = await requestDeviceCode();

  console.log('\n┌─────────────────────────────────────────┐');
  console.log('│  GitHub Copilot — Device Authentication  │');
  console.log('└─────────────────────────────────────────┘');
  console.log(`\n  1. Open this URL in your browser:`);
  console.log(`     \x1b[36m${deviceCode.verification_uri}\x1b[0m`);
  console.log(`\n  2. Enter the code: \x1b[33m${deviceCode.user_code}\x1b[0m`);
  console.log(`\n  Waiting for authorization...\n`);

  const accessToken = await pollForAccessToken(
    deviceCode.device_code,
    deviceCode.interval
  );

  const config = loadConfig();
  config.github_token = accessToken;
  // Invalidate cached Copilot token when re-logging in
  delete config.copilot_token;
  delete config.copilot_token_expires_at;
  saveConfig(config);

  console.log('\x1b[32m✓ Authenticated successfully!\x1b[0m\n');
}

export function isLoggedIn(): boolean {
  const config = loadConfig();
  return Boolean(config.github_token);
}

export function logout(): void {
  saveConfig({});
  console.log('Logged out.');
}

// ─── Copilot Session Token ─────────────────────────────────────────────────────

interface CopilotTokenResponse {
  token: string;
  expires_at: number;
}

async function getCopilotToken(): Promise<string> {
  const config = loadConfig();

  if (!config.github_token) {
    throw new Error(
      'Not authenticated. Run \x1b[33mintellicode auth login\x1b[0m first.'
    );
  }

  // Use cached token if still valid (with 60-second buffer)
  if (
    config.copilot_token &&
    config.copilot_token_expires_at &&
    Date.now() / 1000 < config.copilot_token_expires_at - 60
  ) {
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
    throw new Error(
      `Failed to retrieve Copilot token (HTTP ${status}). ` +
        'Make sure your GitHub account has an active Copilot subscription.'
    );
  }

  const tokenData = JSON.parse(data) as CopilotTokenResponse;
  config.copilot_token = tokenData.token;
  config.copilot_token_expires_at = tokenData.expires_at;
  saveConfig(config);

  return tokenData.token;
}

// ─── Chat Completions ──────────────────────────────────────────────────────────

const VSCODE_SESSION_ID = generateSessionId();
const VSCODE_MACHINE_ID = generateMachineId();

function generateSessionId(): string {
  return (
    Math.random().toString(36).substring(2) +
    Date.now().toString(36)
  );
}

function generateMachineId(): string {
  return Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
}

/**
 * Stream a chat completion from the Copilot API.
 *
 * @param messages    Conversation history.
 * @param tools       Optional tool definitions (OpenAI function-calling format).
 * @param onChunk     Called with each text chunk as it arrives.
 * @param model       Model ID to use (default: 'gpt-4o').
 * @param temperature Sampling temperature (default: 0.1).
 * @param maxTokens   Maximum tokens in the response (default: 4096).
 * @param signal      Optional AbortSignal to cancel the in-flight request.
 * @returns           Full assembled response (content + tool_calls).
 */
export async function streamChatCompletion(
  messages: Message[],
  tools: ToolDefinition[],
  onChunk: (chunk: string) => void,
  model: string = 'gpt-4o',
  temperature: number = 0.1,
  maxTokens: number = 4096,
  signal?: AbortSignal,
): Promise<ChatCompletionResponse> {
  const copilotToken = await getCopilotToken();

  const requestBody = JSON.stringify({
    model,
    messages,
    tools: tools.length > 0 ? tools : undefined,
    tool_choice: tools.length > 0 ? 'auto' : undefined,
    stream: true,
    max_tokens: maxTokens,
    temperature,
  });

  // Honour a pre-aborted signal immediately
  if (signal?.aborted) {
    return Promise.resolve({ content: '', tool_calls: [] });
  }

  return new Promise((resolve, reject) => {
    const parsed = new URL(COPILOT_CHAT_URL);
    const options: https.RequestOptions = {
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

    const req = https.request(options, (res: IncomingMessage) => {
      if (res.statusCode !== 200) {
        let errData = '';
        res.on('data', (c: Buffer) => (errData += c.toString()));
        res.on('end', () =>
          reject(
            new Error(
              `Copilot API error (HTTP ${res.statusCode}): ${errData}`
            )
          )
        );
        return;
      }

      let buffer = '';
      let fullContent = '';

      // Accumulate tool call fragments indexed by their position
      const toolCallAccumulator: Map<
        number,
        { id: string; name: string; arguments: string }
      > = new Map();

      res.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;

          try {
            const json = JSON.parse(
              trimmed.slice(6)
            ) as ChatCompletionChunk;
            const delta = json.choices[0]?.delta;
            if (!delta) continue;

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
                if (tc.id) existing.id = tc.id;
                if (tc.function?.name) existing.name += tc.function.name;
                if (tc.function?.arguments)
                  existing.arguments += tc.function.arguments;
                toolCallAccumulator.set(tc.index, existing);
              }
            }
          } catch {
            // skip malformed SSE lines
          }
        }
      });

      res.on('end', () => {
        const toolCalls: ToolCall[] = [];
        for (const [, tc] of toolCallAccumulator) {
          toolCalls.push({
            id: tc.id || generateSessionId(),
            type: 'function',
            function: { name: tc.name, arguments: tc.arguments },
          });
        }
        resolve({ content: fullContent, tool_calls: toolCalls });
      });

      res.on('error', (err) => {
        if (signal?.aborted) {
          // Resolve with what we have so far instead of rejecting
          resolve({ content: fullContent, tool_calls: [] });
        } else {
          reject(err);
        }
      });
    });

    req.on('error', (err) => {
      // Treat connection resets from an abort as a clean resolution
      if (signal?.aborted) {
        resolve({ content: '', tool_calls: [] });
      } else {
        reject(err);
      }
    });
    req.write(requestBody);
    req.end();

    // Wire up the abort signal: destroy the underlying socket so the response
    // handler resolves immediately with whatever was accumulated so far.
    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          req.destroy();
        },
        { once: true }
      );
    }
  });
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fetch available Copilot models (for diagnostics / future use). */
export async function listModels(): Promise<string[]> {
  const copilotToken = await getCopilotToken();
  const { status, data } = await httpsRequest(
    'https://api.githubcopilot.com/models',
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${copilotToken}`,
        'Editor-Version': 'vscode/1.90.0',
        'User-Agent': 'GitHubCopilotChat/0.16.1',
      },
    }
  );

  if (status !== 200) return ['gpt-4o', 'gpt-4', 'claude-3.5-sonnet'];

  try {
    const parsed = JSON.parse(data) as {
      data: Array<{ id: string }>;
    };
    return parsed.data.map((m) => m.id);
  } catch {
    return ['gpt-4o', 'gpt-4', 'claude-3.5-sonnet'];
  }
}

/** Return the path to the config file (used for diagnostic output). */
export function getConfigPath(): string {
  return CONFIG_FILE;
}

/** Persist the user's preferred model and think level. */
export function saveModelSettings(model: string, thinkLevel: string): void {
  const config = loadConfig();
  config.selected_model = model;
  config.think_level = thinkLevel;
  saveConfig(config);
}

/** Load the user's preferred model and think level. */
export function loadModelSettings(): { model: string; thinkLevel: string } {
  const config = loadConfig();
  return {
    model: config.selected_model ?? 'gpt-4o',
    thinkLevel: config.think_level ?? 'medium',
  };
}

/** Return whether there is a cached (possibly expired) Copilot token. */
export function authStatus(): {
  loggedIn: boolean;
  tokenExpiry?: Date;
} {
  const config = loadConfig();
  if (!config.github_token) return { loggedIn: false };
  if (config.copilot_token_expires_at) {
    return {
      loggedIn: true,
      tokenExpiry: new Date(config.copilot_token_expires_at * 1000),
    };
  }
  return { loggedIn: true };
}
