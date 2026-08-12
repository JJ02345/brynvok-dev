import * as path from 'node:path';
import * as vscode from 'vscode';

export class WorkspacePathError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'WorkspacePathError';
	}
}

/** Returns the first open workspace folder, or fails if none is open. */
export function requireWorkspaceRoot(): vscode.Uri {
	const folder = vscode.workspace.workspaceFolders?.[0];

	if (!folder) {
		throw new WorkspacePathError('Open a folder or workspace before using project tools.');
	}

	return folder.uri;
}

/**
 * Resolves a path the model supplied relative to the workspace root and
 * refuses anything that would leave it. Absolute paths are accepted only when
 * they still sit under that root.
 */
export function resolveWorkspacePath(relative: string): { uri: vscode.Uri; relativePath: string } {
	const root = requireWorkspaceRoot();
	const cleaned = (relative ?? '').replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/^\/+/, '');
	const candidate = cleaned
		? vscode.Uri.joinPath(root, ...cleaned.split('/').filter(Boolean))
		: root;

	const rootPath = path.resolve(root.fsPath);
	const candidatePath = path.resolve(candidate.fsPath);
	const relativePath = path.relative(rootPath, candidatePath).replace(/\\/g, '/');

	if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
		throw new WorkspacePathError(`Path is outside the workspace: ${relative || '.'}`);
	}

	return {
		uri: candidate,
		relativePath: relativePath === '' ? '.' : relativePath,
	};
}

export function asString(value: unknown, fallback = ''): string {
	return typeof value === 'string' ? value : fallback;
}

export function asNumber(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
