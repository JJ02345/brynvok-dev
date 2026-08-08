import * as vscode from 'vscode';
import type { BrynvokConfig } from '../config';
import type { OllamaClient } from '../ollama/client';
import { OllamaError, describeError } from '../ollama/errors';

export class OllamaInlineCompletionProvider implements vscode.InlineCompletionItemProvider {
	constructor(
		private readonly client: OllamaClient,
		private readonly getConfig: () => BrynvokConfig,
		private readonly log: vscode.LogOutputChannel,
	) {}

	async provideInlineCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
		_context: vscode.InlineCompletionContext,
		token: vscode.CancellationToken,
	): Promise<vscode.InlineCompletionItem[] | undefined> {
		const { completion } = this.getConfig();

		if (!completion.enabled || completion.disabledLanguages.includes(document.languageId)) {
			return undefined;
		}

		// Every keystroke asks for a completion, so wait out the burst before
		// spending a generation on a prefix the user has already moved past.
		if (!(await settled(completion.debounce, token))) {
			return undefined;
		}

		const { prefix, suffix } = sliceAround(document, position, completion.contextChars);

		if (!prefix.trim()) {
			return undefined;
		}

		const controller = new AbortController();
		const cancellation = token.onCancellationRequested(() => controller.abort());

		try {
			const generated = await this.client.generate(
				{
					model: completion.model,
					prompt: prefix,
					suffix,
					options: {
						num_predict: completion.maxTokens,
						temperature: 0,
					},
				},
				controller.signal,
			);

			const text = cleanCompletion(generated);

			if (!text || token.isCancellationRequested) {
				return undefined;
			}

			return [new vscode.InlineCompletionItem(text, new vscode.Range(position, position))];
		} catch (error) {
			if (error instanceof OllamaError && error.kind === 'aborted') {
				return undefined;
			}

			this.log.error(`Inline completion failed: ${describeError(error)}`);
			return undefined;
		} finally {
			cancellation.dispose();
		}
	}
}

/** Resolves true if the pause elapsed without cancellation. */
function settled(delay: number, token: vscode.CancellationToken): Promise<boolean> {
	if (delay <= 0) {
		return Promise.resolve(!token.isCancellationRequested);
	}

	return new Promise((resolve) => {
		const finish = (elapsed: boolean) => {
			clearTimeout(timer);
			cancellation.dispose();
			resolve(elapsed);
		};

		const cancellation = token.onCancellationRequested(() => finish(false));
		const timer = setTimeout(() => finish(!token.isCancellationRequested), delay);
	});
}

function sliceAround(
	document: vscode.TextDocument,
	position: vscode.Position,
	contextChars: number,
): { prefix: string; suffix: string } {
	const offset = document.offsetAt(position);
	const text = document.getText();

	return {
		prefix: text.slice(Math.max(0, offset - contextChars), offset),
		suffix: text.slice(offset, offset + contextChars),
	};
}

/**
 * Base models occasionally wrap their answer in a fence or echo an
 * end-of-text marker despite the FIM prompt. Inserting either into the buffer
 * would be worse than offering nothing.
 */
function cleanCompletion(raw: string): string {
	let text = raw.replace(/<\|[^|]*\|>/g, '');

	const fence = text.indexOf('```');

	if (fence >= 0) {
		text = text.slice(0, fence);
	}

	return text.replace(/\s+$/, '');
}
