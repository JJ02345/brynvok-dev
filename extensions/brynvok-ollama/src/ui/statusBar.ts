import * as vscode from 'vscode';
import type { BrynvokConfig } from '../config';
import type { OllamaClient } from '../ollama/client';
import { describeError } from '../ollama/errors';

export class StatusBar implements vscode.Disposable {
	private readonly item: vscode.StatusBarItem;

	constructor(
		private readonly client: OllamaClient,
		private readonly getConfig: () => BrynvokConfig,
	) {
		this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
		this.item.command = 'brynvok.ai.checkConnection';
		this.item.show();
	}

	async refresh(): Promise<void> {
		const config = this.getConfig();

		try {
			const version = await this.client.version();

			this.item.text = `$(sparkle) ${config.chat.model}`;
			this.item.tooltip = `Ollama ${version} on ${config.endpoint}. Everything stays on this machine.`;
			this.item.backgroundColor = undefined;
		} catch (error) {
			this.item.text = '$(warning) Brynvok AI';
			this.item.tooltip = describeError(error);
			this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
		}
	}

	dispose(): void {
		this.item.dispose();
	}
}
