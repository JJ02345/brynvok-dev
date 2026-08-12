import * as vscode from 'vscode';
import { updateSetting, type BrynvokConfig } from '../config';
import type { OllamaClient } from '../ollama/client';
import { describeError } from '../ollama/errors';
import { applyEditProposal, runCommandProposal } from '../tools/proposals';
import { ToolRegistry } from '../tools/registry';
import { runAgentTurn } from './agent';
import type { HostToWebview, WebviewToHost } from './protocol';
import { ChatSession } from './session';

export class ChatViewProvider implements vscode.WebviewViewProvider {
	static readonly viewType = 'brynvok.chat';

	private view?: vscode.WebviewView;
	private readonly session = new ChatSession();
	private readonly registry = new ToolRegistry();
	private inFlight?: AbortController;

	constructor(
		private readonly extensionUri: vscode.Uri,
		private readonly client: OllamaClient,
		private readonly getConfig: () => BrynvokConfig,
		private readonly log: vscode.LogOutputChannel,
	) {}

	resolveWebviewView(view: vscode.WebviewView): void {
		this.view = view;

		view.webview.options = {
			enableScripts: true,
			localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
		};
		view.onDidDispose(() => {
			this.view = undefined;
		});
		view.webview.html = this.render(view.webview);
		view.webview.onDidReceiveMessage((message: WebviewToHost) => {
			void this.handle(message);
		});
	}

	async focus(): Promise<void> {
		await vscode.commands.executeCommand(`${ChatViewProvider.viewType}.focus`);
	}

	clear(): void {
		this.abort();
		this.session.clear();
		this.post({ type: 'cleared' });
		this.postState();
	}

	abort(): void {
		this.inFlight?.abort();
		this.inFlight = undefined;
	}

	async ask(text: string, includeSelection: boolean): Promise<void> {
		const prompt = text.trim();

		if (!prompt) {
			return;
		}

		// A second question while one is running replaces it; queueing would
		// leave the user waiting on an answer they already moved past.
		this.abort();

		const context = includeSelection ? selectionContext() : undefined;
		const composed = context ? `${prompt}\n\n${context}` : prompt;

		this.post({ type: 'user', text: prompt });
		this.session.append('user', composed);

		const controller = new AbortController();
		this.inFlight = controller;
		this.postState(true);

		try {
			await runAgentTurn({
				client: this.client,
				session: this.session,
				registry: this.registry,
				config: this.getConfig(),
				signal: controller.signal,
				log: (line) => this.log.info(line),
				events: {
					onAssistantStart: () => this.post({ type: 'start' }),
					onAssistantText: (delta) => this.post({ type: 'delta', text: delta }),
					onAssistantDone: () => this.post({ type: 'done' }),
					onToolCard: (card) => this.post({ type: 'toolCard', card }),
					onStatus: (status) => this.post({ type: 'status', text: status }),
				},
			});
		} catch (error) {
			if (!controller.signal.aborted) {
				const message = describeError(error);
				this.log.error(`Chat request failed: ${message}`);
				this.post({ type: 'error', message });
			} else {
				this.post({ type: 'done' });
			}
		} finally {
			if (this.inFlight === controller) {
				this.inFlight = undefined;
				this.postState(false);
				this.post({ type: 'status', text: '' });
			}
		}
	}

	async pickModel(setting: 'chat.model' | 'completion.model'): Promise<void> {
		const models = await this.client.listModels();

		if (models.length === 0) {
			void vscode.window.showWarningMessage(
				'The Ollama server has no models. Pull one first, for example "ollama pull qwen2.5-coder:7b".',
			);
			return;
		}

		const picked = await vscode.window.showQuickPick(
			models.map((model) => ({
				label: model.name,
				description: model.details?.parameter_size,
			})),
			{ title: 'Select an Ollama model', matchOnDescription: true },
		);

		if (picked) {
			await updateSetting(setting, picked.label);
			this.postState();
		}
	}

	private async handle(message: WebviewToHost): Promise<void> {
		switch (message.type) {
			case 'ready':
				this.postState();
				break;
			case 'prompt':
				await this.ask(message.text, message.includeSelection);
				break;
			case 'abort':
				this.abort();
				break;
			case 'clear':
				this.clear();
				break;
			case 'pickModel':
				await this.pickModel('chat.model');
				break;
			case 'applyProposal':
				await this.applyProposal(message.id);
				break;
			case 'runProposal':
				await this.runProposal(message.id);
				break;
			case 'dismissProposal':
				this.dismissProposal(message.id);
				break;
		}
	}

	private async applyProposal(id: string): Promise<void> {
		const proposal = this.registry.proposals.get(id);

		if (!proposal || proposal.kind !== 'edit') {
			this.post({ type: 'proposalStatus', id, status: 'error', message: 'Proposal not found.' });
			return;
		}

		if (proposal.status !== 'pending') {
			this.post({ type: 'proposalStatus', id, status: proposal.status === 'applied' ? 'applied' : 'dismissed' });
			return;
		}

		try {
			await applyEditProposal(proposal);
			this.registry.proposals.mark(id, 'applied');
			this.session.append(
				'user',
				`[system] The user applied the edit to ${proposal.path}.`,
			);
			this.post({ type: 'proposalStatus', id, status: 'applied' });
		} catch (error) {
			this.post({
				type: 'proposalStatus',
				id,
				status: 'error',
				message: describeError(error),
			});
		}
	}

	private async runProposal(id: string): Promise<void> {
		const proposal = this.registry.proposals.get(id);

		if (!proposal || proposal.kind !== 'command') {
			this.post({ type: 'proposalStatus', id, status: 'error', message: 'Proposal not found.' });
			return;
		}

		if (proposal.status !== 'pending') {
			this.post({ type: 'proposalStatus', id, status: proposal.status === 'ran' ? 'ran' : 'dismissed' });
			return;
		}

		try {
			await runCommandProposal(proposal);
			this.registry.proposals.mark(id, 'ran');
			this.session.append(
				'user',
				`[system] The user ran this command in the integrated terminal:\n${proposal.command}`,
			);
			this.post({ type: 'proposalStatus', id, status: 'ran' });
		} catch (error) {
			this.post({
				type: 'proposalStatus',
				id,
				status: 'error',
				message: describeError(error),
			});
		}
	}

	private dismissProposal(id: string): void {
		const proposal = this.registry.proposals.get(id);

		if (!proposal || proposal.status !== 'pending') {
			return;
		}

		this.registry.proposals.mark(id, 'dismissed');
		this.session.append(
			'user',
			proposal.kind === 'edit'
				? `[system] The user dismissed the edit to ${proposal.path}.`
				: `[system] The user dismissed the command: ${proposal.command}`,
		);
		this.post({ type: 'proposalStatus', id, status: 'dismissed' });
	}

	private postState(busy = this.inFlight !== undefined): void {
		this.post({ type: 'state', model: this.getConfig().chat.model, busy });
	}

	private post(message: HostToWebview): void {
		void this.view?.webview.postMessage(message);
	}

	private render(webview: vscode.Webview): string {
		const nonce = createNonce();
		const asset = (name: string) =>
			webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', name));

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
	<link href="${asset('chat.css')}" rel="stylesheet">
	<title>Brynvok AI</title>
</head>
<body>
	<div id="log" class="log" role="log" aria-live="polite"></div>
	<div id="status" class="status" hidden></div>
	<div class="composer">
		<label class="context">
			<input type="checkbox" id="include-selection" checked>
			Include editor selection
		</label>
		<textarea id="prompt" rows="3" placeholder="Ask about your project. Tools can read files, propose edits and suggest terminal commands."></textarea>
		<div class="actions">
			<button id="model" class="link" type="button" title="Change model"></button>
			<span class="spacer"></span>
			<button id="send" type="button">Send</button>
			<button id="stop" type="button" hidden>Stop</button>
		</div>
	</div>
	<script nonce="${nonce}" src="${asset('chat.js')}"></script>
</body>
</html>`;
	}
}

/**
 * Sends the selected code with the question so the model can answer about it
 * without the extension reading anything the user did not point at.
 */
function selectionContext(): string | undefined {
	const editor = vscode.window.activeTextEditor;

	if (!editor || editor.selection.isEmpty) {
		return undefined;
	}

	const selected = editor.document.getText(editor.selection);
	const name = vscode.workspace.asRelativePath(editor.document.uri);
	const start = editor.selection.start.line + 1;
	const end = editor.selection.end.line + 1;

	return `From ${name}, lines ${start}-${end}:\n\`\`\`${editor.document.languageId}\n${selected}\n\`\`\``;
}

function createNonce(): string {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let nonce = '';

	for (let i = 0; i < 32; i++) {
		nonce += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
	}

	return nonce;
}
