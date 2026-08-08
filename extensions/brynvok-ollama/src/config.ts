import * as vscode from 'vscode';

export const CONFIG_SECTION = 'brynvok.ai';

export interface ChatConfig {
	model: string;
	temperature: number;
	systemPrompt: string;
	historyLimit: number;
}

export interface CompletionConfig {
	enabled: boolean;
	model: string;
	debounce: number;
	maxTokens: number;
	contextChars: number;
	disabledLanguages: string[];
}

export interface BrynvokConfig {
	endpoint: string;
	allowNonLocalEndpoint: boolean;
	requestTimeout: number;
	chat: ChatConfig;
	completion: CompletionConfig;
}

export function readConfig(scope?: vscode.ConfigurationScope): BrynvokConfig {
	const config = vscode.workspace.getConfiguration(CONFIG_SECTION, scope);

	return {
		endpoint: config.get<string>('endpoint', 'http://127.0.0.1:11434'),
		allowNonLocalEndpoint: config.get<boolean>('allowNonLocalEndpoint', false),
		requestTimeout: config.get<number>('requestTimeout', 120_000),
		chat: {
			model: config.get<string>('chat.model', 'qwen2.5-coder:7b'),
			temperature: config.get<number>('chat.temperature', 0.2),
			systemPrompt: config.get<string>('chat.systemPrompt', ''),
			historyLimit: config.get<number>('chat.historyLimit', 20),
		},
		completion: {
			enabled: config.get<boolean>('completion.enabled', true),
			model: config.get<string>('completion.model', 'qwen2.5-coder:1.5b-base'),
			debounce: config.get<number>('completion.debounce', 300),
			maxTokens: config.get<number>('completion.maxTokens', 128),
			contextChars: config.get<number>('completion.contextChars', 2000),
			disabledLanguages: config.get<string[]>('completion.disabledLanguages', []),
		},
	};
}

export async function updateSetting(key: string, value: unknown): Promise<void> {
	await vscode.workspace
		.getConfiguration(CONFIG_SECTION)
		.update(key, value, vscode.ConfigurationTarget.Global);
}
