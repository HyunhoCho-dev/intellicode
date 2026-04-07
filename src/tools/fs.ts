/**
 * File system tools
 *
 * Provides read, write, delete, list, mkdir, move, and stat operations
 * that can be invoked by the agent.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface FsTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

// ─── Individual operations ─────────────────────────────────────────────────────

export async function readFile(filePath: string): Promise<string> {
  const resolved = path.resolve(filePath);
  try {
    const content = fs.readFileSync(resolved, 'utf-8');
    return content;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`readFile failed for "${resolved}": ${msg}`);
  }
}

export async function writeFile(
  filePath: string,
  content: string
): Promise<string> {
  const resolved = path.resolve(filePath);
  try {
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(resolved, content, 'utf-8');
    return `Written ${content.length} characters to "${resolved}".`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`writeFile failed for "${resolved}": ${msg}`);
  }
}

export async function deleteFile(filePath: string): Promise<string> {
  const resolved = path.resolve(filePath);
  try {
    if (!fs.existsSync(resolved)) {
      return `"${resolved}" does not exist; nothing deleted.`;
    }
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      fs.rmSync(resolved, { recursive: true, force: true });
      return `Directory "${resolved}" deleted.`;
    }
    fs.unlinkSync(resolved);
    return `File "${resolved}" deleted.`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`deleteFile failed for "${resolved}": ${msg}`);
  }
}

export async function listDirectory(
  dirPath: string
): Promise<string> {
  const resolved = path.resolve(dirPath);
  try {
    if (!fs.existsSync(resolved)) {
      throw new Error(`Directory "${resolved}" does not exist.`);
    }
    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    if (entries.length === 0) return '(empty directory)';

    const lines = entries.map((e) => {
      const suffix = e.isDirectory() ? '/' : '';
      const size = e.isFile()
        ? ` (${fs.statSync(path.join(resolved, e.name)).size} bytes)`
        : '';
      return `${e.name}${suffix}${size}`;
    });
    return lines.join('\n');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`listDirectory failed for "${resolved}": ${msg}`);
  }
}

export async function createDirectory(dirPath: string): Promise<string> {
  const resolved = path.resolve(dirPath);
  try {
    fs.mkdirSync(resolved, { recursive: true });
    return `Directory "${resolved}" created.`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`createDirectory failed for "${resolved}": ${msg}`);
  }
}

export async function moveFile(
  sourcePath: string,
  destPath: string
): Promise<string> {
  const src = path.resolve(sourcePath);
  const dst = path.resolve(destPath);
  try {
    const dir = path.dirname(dst);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.renameSync(src, dst);
    return `Moved "${src}" → "${dst}".`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`moveFile failed: ${msg}`);
  }
}

export async function statFile(filePath: string): Promise<string> {
  const resolved = path.resolve(filePath);
  try {
    if (!fs.existsSync(resolved)) {
      return `"${resolved}" does not exist.`;
    }
    // Use lstatSync so symlinks are detected rather than followed
    const stat = fs.lstatSync(resolved);
    return JSON.stringify(
      {
        path: resolved,
        type: stat.isDirectory() ? 'directory' : stat.isSymbolicLink() ? 'symlink' : 'file',
        size: stat.size,
        created: stat.birthtime.toISOString(),
        modified: stat.mtime.toISOString(),
        mode: `0${(stat.mode & 0o777).toString(8)}`,
      },
      null,
      2
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`statFile failed for "${resolved}": ${msg}`);
  }
}

// ─── Tool definitions for the agent ──────────────────────────────────────────

export const fsTools: FsTool[] = [
  {
    name: 'read_file',
    description: 'Read the contents of a file. Returns the file content as a string.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute or relative path to the file.',
        },
      },
      required: ['path'],
    },
    execute: async (args) => readFile(args['path'] as string),
  },
  {
    name: 'write_file',
    description:
      'Write content to a file, creating it (and any parent directories) if it does not exist.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute or relative path to the file.',
        },
        content: {
          type: 'string',
          description: 'Content to write into the file.',
        },
      },
      required: ['path', 'content'],
    },
    execute: async (args) =>
      writeFile(args['path'] as string, args['content'] as string),
  },
  {
    name: 'delete_file',
    description: 'Delete a file or directory (recursive for directories).',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute or relative path to the file or directory.',
        },
      },
      required: ['path'],
    },
    execute: async (args) => deleteFile(args['path'] as string),
  },
  {
    name: 'list_directory',
    description: 'List files and subdirectories inside a directory.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute or relative path to the directory.',
        },
      },
      required: ['path'],
    },
    execute: async (args) => listDirectory(args['path'] as string),
  },
  {
    name: 'create_directory',
    description: 'Create a directory and all intermediate parent directories.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute or relative path to the directory to create.',
        },
      },
      required: ['path'],
    },
    execute: async (args) => createDirectory(args['path'] as string),
  },
  {
    name: 'move_file',
    description: 'Move or rename a file or directory.',
    parameters: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          description: 'Source path.',
        },
        destination: {
          type: 'string',
          description: 'Destination path.',
        },
      },
      required: ['source', 'destination'],
    },
    execute: async (args) =>
      moveFile(args['source'] as string, args['destination'] as string),
  },
  {
    name: 'stat_file',
    description: 'Get metadata (size, type, timestamps) for a file or directory.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute or relative path to the file or directory.',
        },
      },
      required: ['path'],
    },
    execute: async (args) => statFile(args['path'] as string),
  },
];
