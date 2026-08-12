import type { BrynvokConfig } from '../config';
import { parseEndpoint } from './endpoint';
import { OllamaError } from './errors';
import type {
	ChatMessage,
	ChatRequest,
	ChatResponse,
	ChatStreamChunk,
	GenerateRequest,
	GenerateResponse,
	OllamaModel,
	TagsResponse,
	VersionResponse,
} from './types';

export class OllamaClient {
	constructor(private readonly getConfig: () => BrynvokConfig) {}

	async version(signal?: AbortSignal): Promise<string> {
		const body = await this.requestJson<VersionResponse>('/api/version', undefined, signal);
		return body.version;
	}

	async listModels(signal?: AbortSignal): Promise<OllamaModel[]> {
		const body = await this.requestJson<TagsResponse>('/api/tags', undefined, signal);
		return body.models ?? [];
	}

	/**
	 * Single-turn chat. Prefer this when tools are attached so the full
	 * assistant message, including tool calls, is available at once.
	 */
	async chat(request: ChatRequest, signal?: AbortSignal): Promise<ChatMessage> {
		const response = await this.send('/api/chat', { ...request, stream: false }, signal);
		const body = (await response.json()) as ChatResponse;

		if (body.error) {
			throw new OllamaError('http', body.error);
		}

		if (!body.message) {
			throw new OllamaError('malformed', 'The server returned no assistant message.');
		}

		return body.message;
	}

	/**
	 * Yields content deltas as they arrive. The caller drives the loop, so
	 * breaking out of it stops reading but does not cancel the server side;
	 * pass a signal for that.
	 */
	async *streamChat(request: ChatRequest, signal?: AbortSignal): AsyncGenerator<string> {
		const response = await this.send('/api/chat', { ...request, stream: true }, signal);
		const body = response.body;

		if (!body) {
			throw new OllamaError('malformed', 'The server returned an empty response body.');
		}

		for await (const line of readLines(body)) {
			const chunk = parseJsonLine<ChatStreamChunk>(line);

			if (chunk.error) {
				throw new OllamaError('http', chunk.error);
			}

			const content = chunk.message?.content;

			if (content) {
				yield content;
			}

			if (chunk.done) {
				return;
			}
		}
	}

	/** Single-shot completion, used for fill-in-the-middle where streaming buys nothing. */
	async generate(request: GenerateRequest, signal?: AbortSignal): Promise<string> {
		const response = await this.send('/api/generate', { ...request, stream: false }, signal);
		const body = (await response.json()) as GenerateResponse;

		if (body.error) {
			throw new OllamaError('http', body.error);
		}

		return body.response ?? '';
	}

	private async requestJson<T>(path: string, payload: unknown, signal?: AbortSignal): Promise<T> {
		const response = await this.send(path, payload, signal);
		return (await response.json()) as T;
	}

	private async send(path: string, payload: unknown, signal?: AbortSignal): Promise<Response> {
		const config = this.getConfig();
		const base = parseEndpoint(config.endpoint, config.allowNonLocalEndpoint);
		const url = new URL(path, base);

		const timeout = AbortSignal.timeout(config.requestTimeout);
		const combined = signal ? AbortSignal.any([timeout, signal]) : timeout;

		let response: Response;

		try {
			response = await fetch(url, {
				method: payload === undefined ? 'GET' : 'POST',
				headers: payload === undefined ? undefined : { 'Content-Type': 'application/json' },
				body: payload === undefined ? undefined : JSON.stringify(payload),
				signal: combined,
			});
		} catch (error) {
			throw toOllamaError(error, url, signal);
		}

		if (!response.ok) {
			const detail = (await response.text().catch(() => '')).trim();

			throw new OllamaError(
				'http',
				`The server answered ${response.status} ${response.statusText}.`,
				detail || undefined,
			);
		}

		return response;
	}
}

function toOllamaError(error: unknown, url: URL, external?: AbortSignal): OllamaError {
	if (external?.aborted) {
		return new OllamaError('aborted', 'The request was cancelled.');
	}

	// AbortSignal.timeout reports a TimeoutError; an external abort is handled above.
	if (error instanceof Error && error.name === 'TimeoutError') {
		return new OllamaError('unreachable', 'The server did not answer in time.');
	}

	if (error instanceof Error && error.name === 'AbortError') {
		return new OllamaError('aborted', 'The request was cancelled.');
	}

	return new OllamaError(
		'unreachable',
		`Cannot reach the Ollama server at ${url.origin}.`,
		'Start it with "ollama serve" and check brynvok.ai.endpoint.',
	);
}

function parseJsonLine<T>(line: string): T {
	try {
		return JSON.parse(line) as T;
	} catch {
		throw new OllamaError('malformed', 'The server sent a response that is not valid JSON.');
	}
}

/**
 * Splits a byte stream into newline-delimited strings. A chunk boundary can
 * fall inside a line or inside a multi-byte character, so both the buffer and
 * the decoder have to carry state across reads.
 */
async function* readLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	try {
		for (;;) {
			const { done, value } = await reader.read();

			if (done) {
				break;
			}

			if (!value) {
				continue;
			}

			buffer += decoder.decode(value, { stream: true });

			let newline = buffer.indexOf('\n');

			while (newline >= 0) {
				const line = buffer.slice(0, newline).trim();
				buffer = buffer.slice(newline + 1);

				if (line) {
					yield line;
				}

				newline = buffer.indexOf('\n');
			}
		}

		const rest = (buffer + decoder.decode()).trim();

		if (rest) {
			yield rest;
		}
	} finally {
		reader.releaseLock();
	}
}
