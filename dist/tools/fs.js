"use strict";
/**
 * File system tools
 *
 * Provides read, write, delete, list, mkdir, move, and stat operations
 * that can be invoked by the agent.
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
exports.fsTools = void 0;
exports.readFile = readFile;
exports.writeFile = writeFile;
exports.deleteFile = deleteFile;
exports.listDirectory = listDirectory;
exports.createDirectory = createDirectory;
exports.moveFile = moveFile;
exports.statFile = statFile;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// ─── Individual operations ─────────────────────────────────────────────────────
async function readFile(filePath) {
    const resolved = path.resolve(filePath);
    try {
        const content = fs.readFileSync(resolved, 'utf-8');
        return content;
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`readFile failed for "${resolved}": ${msg}`);
    }
}
async function writeFile(filePath, content) {
    const resolved = path.resolve(filePath);
    try {
        const dir = path.dirname(resolved);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(resolved, content, 'utf-8');
        return `Written ${content.length} characters to "${resolved}".`;
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`writeFile failed for "${resolved}": ${msg}`);
    }
}
async function deleteFile(filePath) {
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
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`deleteFile failed for "${resolved}": ${msg}`);
    }
}
async function listDirectory(dirPath) {
    const resolved = path.resolve(dirPath);
    try {
        if (!fs.existsSync(resolved)) {
            throw new Error(`Directory "${resolved}" does not exist.`);
        }
        const entries = fs.readdirSync(resolved, { withFileTypes: true });
        if (entries.length === 0)
            return '(empty directory)';
        const lines = entries.map((e) => {
            const suffix = e.isDirectory() ? '/' : '';
            const size = e.isFile()
                ? ` (${fs.statSync(path.join(resolved, e.name)).size} bytes)`
                : '';
            return `${e.name}${suffix}${size}`;
        });
        return lines.join('\n');
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`listDirectory failed for "${resolved}": ${msg}`);
    }
}
async function createDirectory(dirPath) {
    const resolved = path.resolve(dirPath);
    try {
        fs.mkdirSync(resolved, { recursive: true });
        return `Directory "${resolved}" created.`;
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`createDirectory failed for "${resolved}": ${msg}`);
    }
}
async function moveFile(sourcePath, destPath) {
    const src = path.resolve(sourcePath);
    const dst = path.resolve(destPath);
    try {
        const dir = path.dirname(dst);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.renameSync(src, dst);
        return `Moved "${src}" → "${dst}".`;
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`moveFile failed: ${msg}`);
    }
}
async function statFile(filePath) {
    const resolved = path.resolve(filePath);
    try {
        if (!fs.existsSync(resolved)) {
            return `"${resolved}" does not exist.`;
        }
        // Use lstatSync so symlinks are detected rather than followed
        const stat = fs.lstatSync(resolved);
        return JSON.stringify({
            path: resolved,
            type: stat.isDirectory() ? 'directory' : stat.isSymbolicLink() ? 'symlink' : 'file',
            size: stat.size,
            created: stat.birthtime.toISOString(),
            modified: stat.mtime.toISOString(),
            mode: `0${(stat.mode & 0o777).toString(8)}`,
        }, null, 2);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`statFile failed for "${resolved}": ${msg}`);
    }
}
// ─── Tool definitions for the agent ──────────────────────────────────────────
exports.fsTools = [
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
        execute: async (args) => readFile(args['path']),
    },
    {
        name: 'write_file',
        description: 'Write content to a file, creating it (and any parent directories) if it does not exist.',
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
        execute: async (args) => writeFile(args['path'], args['content']),
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
        execute: async (args) => deleteFile(args['path']),
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
        execute: async (args) => listDirectory(args['path']),
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
        execute: async (args) => createDirectory(args['path']),
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
        execute: async (args) => moveFile(args['source'], args['destination']),
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
        execute: async (args) => statFile(args['path']),
    },
];
//# sourceMappingURL=fs.js.map