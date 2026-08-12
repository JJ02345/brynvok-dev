import * as vscode from 'vscode';
import { asNumber, asString, resolveWorkspacePath, WorkspacePathError } from './paths';
import type { WorkspaceTool } from './types';

const IGNORE = [
	'**/node_modules/**',
	'**/.git/**',
	'**/out/**',
	'**/dist/**',
	'**/.build/**',
	'**/VSCode-*/**',
];

const MAX_LIST = 200;
const MAX_READ_CHARS = 40_000;
const MAX_SEARCH_HITS = 40;

export const listFilesTool: WorkspaceTool = {
	kind: 'read',
	definition: {
		type: 'function',
		function: {
			name: 'list_files',
			description:
				'List files and directories under a path relative to the workspace root. Use an empty path for the root.',
			parameters: {
				type: 'object',
				properties: {
					path: {
						type: 'string',
						description: 'Relative directory. Empty string or "." means the workspace root.',
					},
				},
				required: [],
			},
		},
	},
	async run(call) {
		try {
			const requested = asString(call.arguments.path, '.');
			const { uri, relativePath } = resolveWorkspacePath(requested);
			const pattern = relativePath === '.' ? '**/*' : `${relativePath}/**/*`;
			const files = await vscode.workspace.findFiles(pattern, `{${IGNORE.join(',')}}`, MAX_LIST);
			const root = vscode.workspace.workspaceFolders![0].uri;
			const lines = files
				.map((file) => vscode.workspace.asRelativePath(file, false))
				.sort((a, b) => a.localeCompare(b));

			if (lines.length === 0) {
				const entries = await vscode.workspace.fs.readDirectory(uri);
				const fallback = entries
					.map(([name, type]) => `${type === vscode.FileType.Directory ? name + '/' : name}`)
					.sort((a, b) => a.localeCompare(b));

				return {
					content:
						fallback.length === 0
							? `No entries under ${relativePath}.`
							: `Entries under ${relativePath}:\n${fallback.join('\n')}`,
					card: {
						kind: 'info',
						title: `Listed ${relativePath}`,
						body: fallback.length === 0 ? '(empty)' : fallback.slice(0, 30).join('\n'),
					},
				};
			}

			const truncated = files.length >= MAX_LIST;
			const body = lines.join('\n') + (truncated ? `\n… truncated after ${MAX_LIST} entries` : '');

			return {
				content: `Files under ${relativePath} (workspace ${vscode.workspace.asRelativePath(root)}):\n${body}`,
				card: {
					kind: 'info',
					title: `Listed ${relativePath}`,
					body: lines.slice(0, 30).join('\n') + (lines.length > 30 ? `\n… ${lines.length - 30} more` : ''),
				},
			};
		} catch (error) {
			return { content: describeToolError(error) };
		}
	},
};

export const readFileTool: WorkspaceTool = {
	kind: 'read',
	definition: {
		type: 'function',
		function: {
			name: 'read_file',
			description: 'Read a UTF-8 text file relative to the workspace root.',
			parameters: {
				type: 'object',
				properties: {
					path: {
						type: 'string',
						description: 'Relative file path.',
					},
				},
				required: ['path'],
			},
		},
	},
	async run(call) {
		try {
			const requested = asString(call.arguments.path);

			if (!requested) {
				return { content: 'read_file requires a path argument.' };
			}

			const { uri, relativePath } = resolveWorkspacePath(requested);
			const raw = await vscode.workspace.fs.readFile(uri);
			let text = Buffer.from(raw).toString('utf8');
			let note = '';

			if (text.length > MAX_READ_CHARS) {
				text = text.slice(0, MAX_READ_CHARS);
				note = `\n\n… truncated after ${MAX_READ_CHARS} characters.`;
			}

			return {
				content: `Contents of ${relativePath}:\n\`\`\`\n${text}\n\`\`\`${note}`,
				card: {
					kind: 'info',
					title: `Read ${relativePath}`,
					body: `${text.split(/\r?\n/).length} lines`,
				},
			};
		} catch (error) {
			return { content: describeToolError(error) };
		}
	},
};

export const searchTextTool: WorkspaceTool = {
	kind: 'read',
	definition: {
		type: 'function',
		function: {
			name: 'search_text',
			description: 'Search for a text pattern across workspace files. Returns matching lines with paths.',
			parameters: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						description: 'Literal text or JavaScript regular expression source.',
					},
					path: {
						type: 'string',
						description: 'Optional relative directory to limit the search.',
					},
					max_results: {
						type: 'number',
						description: 'Maximum number of matching lines to return.',
					},
				},
				required: ['query'],
			},
		},
	},
	async run(call) {
		try {
			const query = asString(call.arguments.query);

			if (!query) {
				return { content: 'search_text requires a query argument.' };
			}

			const max = Math.min(MAX_SEARCH_HITS, Math.max(1, asNumber(call.arguments.max_results, MAX_SEARCH_HITS)));
			const scope = asString(call.arguments.path, '.');
			const { relativePath } = resolveWorkspacePath(scope);
			const pattern = relativePath === '.' ? '**/*' : `${relativePath}/**/*`;
			const files = await vscode.workspace.findFiles(pattern, `{${IGNORE.join(',')}}`, 400);
			let regex: RegExp;

			try {
				regex = new RegExp(query, 'i');
			} catch {
				regex = new RegExp(escapeRegExp(query), 'i');
			}

			const hits: string[] = [];

			for (const file of files) {
				if (hits.length >= max) {
					break;
				}

				let text: string;

				try {
					text = Buffer.from(await vscode.workspace.fs.readFile(file)).toString('utf8');
				} catch {
					continue;
				}

				if (text.includes('\u0000')) {
					continue;
				}

				const rel = vscode.workspace.asRelativePath(file, false);
				const lines = text.split(/\r?\n/);

				for (let i = 0; i < lines.length; i++) {
					if (hits.length >= max) {
						break;
					}

					if (regex.test(lines[i])) {
						hits.push(`${rel}:${i + 1}: ${lines[i].trim()}`);
					}
				}
			}

			if (hits.length === 0) {
				return { content: `No matches for ${JSON.stringify(query)} under ${relativePath}.` };
			}

			return {
				content: `Matches for ${JSON.stringify(query)}:\n${hits.join('\n')}`,
				card: {
					kind: 'info',
					title: `Search ${JSON.stringify(query)}`,
					body: hits.slice(0, 12).join('\n'),
				},
			};
		} catch (error) {
			return { content: describeToolError(error) };
		}
	},
};

function describeToolError(error: unknown): string {
	if (error instanceof WorkspacePathError) {
		return error.message;
	}

	if (error instanceof vscode.FileSystemError) {
		return error.message;
	}

	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
