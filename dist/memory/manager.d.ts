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
export declare class MemoryManager {
    private entries;
    constructor();
    private load;
    private save;
    /** Store (or update) a key-value memory entry. */
    set(key: string, value: string): void;
    /** Retrieve a memory entry by key, or undefined if not found. */
    get(key: string): string | undefined;
    /** Return all stored memory entries. */
    getAll(): MemoryEntry[];
    /** Delete a memory entry. Returns true if an entry was removed. */
    delete(key: string): boolean;
    /** Remove all memory entries. */
    clear(): void;
    /** Return the number of stored memories. */
    get size(): number;
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
    toContextString(): string;
    /** Return the file path used for persistence. */
    static getMemoryPath(): string;
}
//# sourceMappingURL=manager.d.ts.map