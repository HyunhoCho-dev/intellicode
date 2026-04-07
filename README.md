# IntelliCode

> AI coding agent powered by **GitHub Copilot** — works in PowerShell and bash.

IntelliCode is a terminal-based AI coding agent similar to Claude Code, but optimized for **PowerShell** environments and backed by your existing **GitHub Copilot** subscription. It can read and write files, run shell commands, debug failing tests, and is extensible via **MCP (Model Context Protocol)** servers.

---

## ✨ Features

| Feature | Description |
|---|---|
| **GitHub Copilot integration** | Uses your existing Copilot subscription — Device Flow auth, no extra API keys |
| **File system tools** | Read, write, delete, list, move, stat files and directories |
| **Shell execution** | Run any PowerShell (Windows) or bash (Unix) command, capture stdout/stderr |
| **Agentic loop** | Plans, executes, and iterates autonomously until the task is complete |
| **Streaming output** | Tokens stream to the terminal in real time |
| **MCP support** | Load external MCP servers to give the agent new capabilities |
| **Interactive REPL** | Persistent context across multiple messages |
| **One-line install** | Single PowerShell command installs everything |

---

## 🚀 Installation

### Option 1 — One-line PowerShell install (recommended)

```powershell
iex (iwr -useb https://raw.githubusercontent.com/HyunhoCho-dev/intellicode/main/install.ps1).Content
```

### Option 2 — npm global install

```bash
npm install -g github:HyunhoCho-dev/intellicode
```

**Prerequisites:** Node.js 18 or later.

---

## 🔑 Authentication

IntelliCode uses **GitHub OAuth Device Flow** — no passwords or API keys needed.

```powershell
intellicode auth login
```

You will be shown a short code and a URL. Open the URL in your browser, enter the code, and you are authenticated. Your GitHub account must have an active **GitHub Copilot** subscription.

Other auth commands:

```powershell
intellicode auth status   # Check login state
intellicode auth logout   # Remove stored credentials
```

---

## 💬 Usage

### Interactive REPL

```powershell
intellicode
```

Starts a persistent session where you can send multiple requests while the agent remembers context.

**REPL shortcuts:**

| Command | Action |
|---|---|
| `/clear` | Reset conversation context |
| `/history` | Show number of messages in context |
| `/exit` | Quit |
| `/help` | Show REPL help |

### Single-shot mode

```powershell
intellicode "explain this project"
intellicode "add unit tests for src/utils.ts"
intellicode "fix the failing test in tests/api.test.ts"
```

---

## 🔧 MCP (Model Context Protocol)

MCP servers extend the agent with new tools (databases, APIs, search engines, etc.).

### Set up MCP servers

```powershell
intellicode mcp init   # Create ~/.intellicode/mcp.json with a sample config
intellicode mcp list   # List configured servers
```

Edit `~/.intellicode/mcp.json`:

```json
{
  "servers": [
    {
      "name": "my-db-server",
      "command": "node",
      "args": ["/path/to/mcp-server/index.js"],
      "env": {
        "DATABASE_URL": "postgres://..."
      }
    }
  ]
}
```

MCP servers are started automatically when intellicode launches.

---

## 📁 Configuration

All configuration is stored in `~/.intellicode/`:

| File | Contents |
|---|---|
| `config.json` | GitHub token + cached Copilot session token |
| `mcp.json` | MCP server configurations |

---

## 🏗️ Project Structure

```
intellicode/
├── src/
│   ├── index.ts                    # CLI entry point
│   ├── providers/
│   │   └── github-copilot.ts       # Auth + Copilot API client
│   ├── agent/
│   │   └── planner.ts              # Agentic reasoning loop
│   ├── tools/
│   │   ├── fs.ts                   # File system tools
│   │   └── shell.ts                # Shell command execution
│   └── mcp/
│       └── manager.ts              # MCP server manager
├── install.ps1                     # One-line PowerShell installer
├── package.json
└── tsconfig.json
```

---

## 🛠️ Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run directly with ts-node
npm run dev

# Link globally for local testing
npm link
```

---

## 📄 License

MIT
