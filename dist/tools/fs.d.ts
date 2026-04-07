/**
 * File system tools
 *
 * Provides read, write, delete, list, mkdir, move, and stat operations
 * that can be invoked by the agent.
 */
export interface FsTool {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    execute: (args: Record<string, unknown>) => Promise<string>;
}
export declare function readFile(filePath: string): Promise<string>;
export declare function writeFile(filePath: string, content: string): Promise<string>;
export declare function deleteFile(filePath: string): Promise<string>;
export declare function listDirectory(dirPath: string): Promise<string>;
export declare function createDirectory(dirPath: string): Promise<string>;
export declare function moveFile(sourcePath: string, destPath: string): Promise<string>;
export declare function statFile(filePath: string): Promise<string>;
export declare const fsTools: FsTool[];
//# sourceMappingURL=fs.d.ts.map