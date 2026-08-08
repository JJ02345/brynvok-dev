import * as vscode from 'vscode';
import { ChatViewProvider } from './chat/chatViewProvider';
import { OllamaInlineCompletionProvider } from './completion/inlineCompletionProvider';
import { CONFIG_SECTION, readConfig, updateSetting } from './config';
import { OllamaClient } from './ollama/client';
import { describeError } from './ollama/errors';
import { StatusBar } from './ui/statusBar';

export function activate(context: vscode.ExtensionContext): void {
	const log = vscode.window.createOutputChannel('Brynvok AI', { log: true });
	// Read on every access rather than cached, so a changed setting applies to
	// the next request instead of the next window.
	const getConfig = () => readConfig();

	const client = new OllamaClient(getConfig);
	const chat = new ChatViewProvider(context.extensionUri, client, getConfig, log);
	const statusBar = new StatusBar(client, getConfig);

	context.subscriptions.push(
		log,
		statusBar,
		vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chat, {
			webviewOptions: { retainContextWhenHidden: true },
		}),
		vscode.languages.registerInlineCompletionItemProvider(
			{ pattern: '**' },
			new OllamaInlineCompletionProvider(client, getConfig, log),
		),
		vscode.commands.registerCommand('brynvok.ai.focusChat', () => chat.focus()),
		vscode.commands.registerCommand('brynvok.ai.clearChat', () => chat.clear()),
		vscode.commands.registerCommand('brynvok.ai.explainSelection', async () => {
			await chat.focus();
			await chat.ask('Explain the selected code.', true);
		}),
		vscode.commands.registerCommand('brynvok.ai.selectChatModel', () =>
			chat.pickModel('chat.model'),
		),
		vscode.commands.registerCommand('brynvok.ai.selectCompletionModel', () =>
			chat.pickModel('completion.model'),
		),
		vscode.commands.registerCommand('brynvok.ai.toggleCompletions', async () => {
			const enabled = !getConfig().completion.enabled;

			await updateSetting('completion.enabled', enabled);
			vscode.window.setStatusBarMessage(
				enabled ? 'Brynvok AI: inline completions on' : 'Brynvok AI: inline completions off',
				3000,
			);
		}),
		vscode.commands.registerCommand('brynvok.ai.checkConnection', async () => {
			try {
				const version = await client.version();
				const models = await client.listModels();

				void vscode.window.showInformationMessage(
					`Ollama ${version} answered on ${getConfig().endpoint} with ${models.length} model(s) installed.`,
				);
			} catch (error) {
				void vscode.window.showErrorMessage(`Brynvok AI: ${describeError(error)}`);
			}

			await statusBar.refresh();
		}),
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration(CONFIG_SECTION)) {
				void statusBar.refresh();
			}
		}),
	);

	void statusBar.refresh();
}

export function deactivate(): void {
	// Everything is disposed through context.subscriptions.
}
