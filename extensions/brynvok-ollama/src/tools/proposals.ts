import * as vscode from 'vscode';
import { resolveWorkspacePath } from './paths';

export interface EditProposal {
	id: string;
	kind: 'edit';
	path: string;
	uri: vscode.Uri;
	isNew: boolean;
	previous: string | undefined;
	next: string;
	diff: string;
	status: 'pending' | 'applied' | 'dismissed';
}

export interface CommandProposal {
	id: string;
	kind: 'command';
	command: string;
	cwd: string;
	status: 'pending' | 'ran' | 'dismissed';
}

export type Proposal = EditProposal | CommandProposal;

export class ProposalStore {
	private readonly items = new Map<string, Proposal>();
	private sequence = 0;

	createEdit(input: {
		path: string;
		next: string;
		previous: string | undefined;
		isNew: boolean;
		diff: string;
		uri: vscode.Uri;
	}): EditProposal {
		const proposal: EditProposal = {
			id: this.nextId('edit'),
			kind: 'edit',
			path: input.path,
			uri: input.uri,
			isNew: input.isNew,
			previous: input.previous,
			next: input.next,
			diff: input.diff,
			status: 'pending',
		};

		this.items.set(proposal.id, proposal);
		return proposal;
	}

	createCommand(command: string, cwd: string): CommandProposal {
		const proposal: CommandProposal = {
			id: this.nextId('cmd'),
			kind: 'command',
			command,
			cwd,
			status: 'pending',
		};

		this.items.set(proposal.id, proposal);
		return proposal;
	}

	get(id: string): Proposal | undefined {
		return this.items.get(id);
	}

	mark(id: string, status: Proposal['status']): void {
		const item = this.items.get(id);

		if (item) {
			item.status = status;
		}
	}

	private nextId(prefix: string): string {
		this.sequence += 1;
		return `${prefix}-${Date.now().toString(36)}-${this.sequence}`;
	}
}

/** Builds a short unified diff for the chat card. */
export function buildUnifiedDiff(path: string, previous: string | undefined, next: string): string {
	const before = previous === undefined ? [] : previous.split(/\r?\n/);
	const after = next.split(/\r?\n/);

	if (previous === undefined) {
		const body = after.map((line) => `+${line}`).join('\n');
		return `--- /dev/null\n+++ b/${path}\n@@ -0,0 +1,${after.length} @@\n${body}`;
	}

	// Line-oriented LCS would be heavier than this chat needs. Emit a compact
	// replace-style hunk that still makes additions and removals obvious.
	const remove = before.map((line) => `-${line}`).join('\n');
	const add = after.map((line) => `+${line}`).join('\n');
	return `--- a/${path}\n+++ b/${path}\n@@ -1,${before.length} +1,${after.length} @@\n${remove}\n${add}`;
}

export async function applyEditProposal(proposal: EditProposal): Promise<void> {
	const data = Buffer.from(proposal.next, 'utf8');
	await vscode.workspace.fs.writeFile(proposal.uri, data);

	const document = await vscode.workspace.openTextDocument(proposal.uri);
	await vscode.window.showTextDocument(document, { preview: false, preserveFocus: true });
}

export async function runCommandProposal(
	proposal: CommandProposal,
	terminalName = 'Brynvok AI',
): Promise<void> {
	const existing = vscode.window.terminals.find((terminal) => terminal.name === terminalName);
	const terminal = existing ?? vscode.window.createTerminal({
		name: terminalName,
		cwd: proposal.cwd || undefined,
	});

	terminal.show(true);
	// A trailing Enter runs the line. The command only reaches the shell after
	// the user has clicked Run in the chat, never on its own.
	terminal.sendText(proposal.command, true);
}

export async function loadExistingText(relativePath: string): Promise<{
	uri: vscode.Uri;
	relativePath: string;
	text: string | undefined;
	isNew: boolean;
}> {
	const resolved = resolveWorkspacePath(relativePath);

	try {
		const raw = await vscode.workspace.fs.readFile(resolved.uri);
		return {
			uri: resolved.uri,
			relativePath: resolved.relativePath,
			text: Buffer.from(raw).toString('utf8'),
			isNew: false,
		};
	} catch (error) {
		if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
			return {
				uri: resolved.uri,
				relativePath: resolved.relativePath,
				text: undefined,
				isNew: true,
			};
		}

		throw error;
	}
}
