import type { ChatMessage, ToolCall } from '../ollama/types';

export interface ParsedToolCall {
	name: string;
	arguments: Record<string, unknown>;
}

export interface ParsedAssistantTurn {
	/** Prose left after tool-call markup has been removed. */
	content: string;
	toolCalls: ParsedToolCall[];
}

/**
 * Collects tool calls from the native Ollama field and from the two formats
 * the Qwen template family emits when it ignores that field: `<tool_call>`
 * tags and fenced JSON objects shaped like `{ "name", "arguments" }`.
 */
export function parseAssistantTurn(message: ChatMessage): ParsedAssistantTurn {
	const fromNative = (message.tool_calls ?? [])
		.map(normalizeNativeCall)
		.filter((call): call is ParsedToolCall => call !== undefined);

	const fromMarkup = extractMarkupCalls(message.content ?? '');
	const toolCalls = dedupeCalls([...fromNative, ...fromMarkup.calls]);

	return {
		content: fromMarkup.remainder.trim(),
		toolCalls,
	};
}

function normalizeNativeCall(call: ToolCall): ParsedToolCall | undefined {
	const name = call.function?.name?.trim();

	if (!name) {
		return undefined;
	}

	return {
		name,
		arguments: coerceArguments(call.function.arguments),
	};
}

function coerceArguments(value: Record<string, unknown> | string | undefined): Record<string, unknown> {
	if (value === undefined || value === null) {
		return {};
	}

	if (typeof value === 'string') {
		const trimmed = value.trim();

		if (!trimmed) {
			return {};
		}

		try {
			const parsed = JSON.parse(trimmed) as unknown;
			return isPlainObject(parsed) ? parsed : {};
		} catch {
			return {};
		}
	}

	return isPlainObject(value) ? value : {};
}

function extractMarkupCalls(raw: string): { remainder: string; calls: ParsedToolCall[] } {
	const calls: ParsedToolCall[] = [];
	let remainder = raw;

	remainder = remainder.replace(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi, (_match, body: string) => {
		const call = parseCallPayload(body);

		if (call) {
			calls.push(call);
		}

		return '';
	});

	remainder = remainder.replace(/```(?:json)?\s*([\s\S]*?)```/gi, (match, body: string) => {
		const call = parseCallPayload(body);

		if (call) {
			calls.push(call);
			return '';
		}

		return match;
	});

	// Bare JSON object that is the entire remaining message.
	const bare = remainder.trim();

	if (bare.startsWith('{') && bare.endsWith('}')) {
		const call = parseCallPayload(bare);

		if (call) {
			calls.push(call);
			remainder = '';
		}
	}

	return { remainder, calls };
}

function parseCallPayload(body: string): ParsedToolCall | undefined {
	const trimmed = body.trim();

	if (!trimmed) {
		return undefined;
	}

	try {
		const parsed = JSON.parse(trimmed) as unknown;

		if (!isPlainObject(parsed)) {
			return undefined;
		}

		const name = typeof parsed.name === 'string' ? parsed.name.trim() : '';

		if (!name) {
			return undefined;
		}

		const args = parsed.arguments;
		return {
			name,
			arguments: coerceArguments(args as Record<string, unknown> | string | undefined),
		};
	} catch {
		return undefined;
	}
}

function dedupeCalls(calls: ParsedToolCall[]): ParsedToolCall[] {
	const seen = new Set<string>();
	const unique: ParsedToolCall[] = [];

	for (const call of calls) {
		const key = `${call.name}:${JSON.stringify(call.arguments)}`;

		if (seen.has(key)) {
			continue;
		}

		seen.add(key);
		unique.push(call);
	}

	return unique;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
