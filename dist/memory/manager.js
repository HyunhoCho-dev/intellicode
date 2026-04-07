"use strict";
/**
 * Long-term memory manager
 *
 * Persists user preferences and important information across sessions using
 * a local JSON file at ~/.intellicode/memory.json.
 *
 * The agent can store memories via the `memory_store` tool, and all memories
 * are injected into the system prompt at the start of every session so the
 * agent can recall them without an explicit lookup.
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
exports.MemoryManager = void 0;
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
// ─── Constants ─────────────────────────────────────────────────────────────────
const MEMORY_FILE = path.join(os.homedir(), '.intellicode', 'memory.json');
// ─── MemoryManager ────────────────────────────────────────────────────────────
class MemoryManager {
    constructor() {
        this.entries = new Map();
        this.load();
    }
    // ── Persistence ──────────────────────────────────────────────────────────
    load() {
        try {
            if (fs.existsSync(MEMORY_FILE)) {
                const raw = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf-8'));
                for (const entry of raw.entries ?? []) {
                    this.entries.set(entry.key, entry);
                }
            }
        }
        catch {
            // Ignore parse errors; start with an empty memory store.
        }
    }
    save() {
        const dir = path.dirname(MEMORY_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
        }
        fs.writeFileSync(MEMORY_FILE, JSON.stringify({ entries: Array.from(this.entries.values()) }, null, 2), { mode: 0o600 });
    }
    // ── CRUD ─────────────────────────────────────────────────────────────────
    /** Store (or update) a key-value memory entry. */
    set(key, value) {
        const now = new Date().toISOString();
        const existing = this.entries.get(key);
        this.entries.set(key, {
            key,
            value,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        });
        this.save();
    }
    /** Retrieve a memory entry by key, or undefined if not found. */
    get(key) {
        return this.entries.get(key)?.value;
    }
    /** Return all stored memory entries. */
    getAll() {
        return Array.from(this.entries.values());
    }
    /** Delete a memory entry. Returns true if an entry was removed. */
    delete(key) {
        const deleted = this.entries.delete(key);
        if (deleted)
            this.save();
        return deleted;
    }
    /** Remove all memory entries. */
    clear() {
        this.entries.clear();
        this.save();
    }
    /** Return the number of stored memories. */
    get size() {
        return this.entries.size;
    }
    // ── Context injection ─────────────────────────────────────────────────────
    /**
     * Format all memories as a context block suitable for injection into the
     * system prompt so the agent can recall them without a separate lookup.
     *
     * Returns an empty string when no memories are stored.
     *
     * Note: Keep the memory store reasonably small (ideally ≤ 50 entries).
     * Each entry adds tokens to every request; large stores increase cost and
     * latency. Use `/memory delete` or `/memory clear` to prune old entries.
     */
    toContextString() {
        if (this.entries.size === 0)
            return '';
        const lines = Array.from(this.entries.values()).map((e) => `  - ${e.key}: ${e.value}`);
        return ('\nLong-term memory (user preferences and important context):\n' +
            lines.join('\n'));
    }
    /** Return the file path used for persistence. */
    static getMemoryPath() {
        return MEMORY_FILE;
    }
}
exports.MemoryManager = MemoryManager;
//# sourceMappingURL=manager.js.map