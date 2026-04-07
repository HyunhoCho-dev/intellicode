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

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MemoryEntry {
  /** Unique identifier / label for this memory. */
  key: string;
  /** The stored value. */
  value: string;
  /** ISO timestamp when the entry was first created. */
  createdAt: string;
  /** ISO timestamp of the most recent update. */
  updatedAt: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const MEMORY_FILE = path.join(os.homedir(), '.intellicode', 'memory.json');

// ─── MemoryManager ────────────────────────────────────────────────────────────

export class MemoryManager {
  private entries: Map<string, MemoryEntry> = new Map();

  constructor() {
    this.load();
  }

  // ── Persistence ──────────────────────────────────────────────────────────

  private load(): void {
    try {
      if (fs.existsSync(MEMORY_FILE)) {
        const raw = JSON.parse(
          fs.readFileSync(MEMORY_FILE, 'utf-8')
        ) as { entries?: MemoryEntry[] };
        for (const entry of raw.entries ?? []) {
          this.entries.set(entry.key, entry);
        }
      }
    } catch {
      // Ignore parse errors; start with an empty memory store.
    }
  }

  private save(): void {
    const dir = path.dirname(MEMORY_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    fs.writeFileSync(
      MEMORY_FILE,
      JSON.stringify({ entries: Array.from(this.entries.values()) }, null, 2),
      { mode: 0o600 }
    );
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────

  /** Store (or update) a key-value memory entry. */
  set(key: string, value: string): void {
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
  get(key: string): string | undefined {
    return this.entries.get(key)?.value;
  }

  /** Return all stored memory entries. */
  getAll(): MemoryEntry[] {
    return Array.from(this.entries.values());
  }

  /** Delete a memory entry. Returns true if an entry was removed. */
  delete(key: string): boolean {
    const deleted = this.entries.delete(key);
    if (deleted) this.save();
    return deleted;
  }

  /** Remove all memory entries. */
  clear(): void {
    this.entries.clear();
    this.save();
  }

  /** Return the number of stored memories. */
  get size(): number {
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
  toContextString(): string {
    if (this.entries.size === 0) return '';
    const lines = Array.from(this.entries.values()).map(
      (e) => `  - ${e.key}: ${e.value}`
    );
    return (
      '\nLong-term memory (user preferences and important context):\n' +
      lines.join('\n')
    );
  }

  /** Return the file path used for persistence. */
  static getMemoryPath(): string {
    return MEMORY_FILE;
  }
}
