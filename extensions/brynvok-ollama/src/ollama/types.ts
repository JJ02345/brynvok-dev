export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
	role: ChatRole;
	content: string;
}

/** Ollama nests sampling parameters under `options` rather than at the top level. */
export interface GenerationOptions {
	temperature?: number;
	num_predict?: number;
	stop?: string[];
}

export interface ModelDetails {
	family?: string;
	parameter_size?: string;
	quantization_level?: string;
}

export interface OllamaModel {
	name: string;
	size?: number;
	details?: ModelDetails;
}

export interface TagsResponse {
	models?: OllamaModel[];
}

export interface VersionResponse {
	version: string;
}

export interface ChatRequest {
	model: string;
	messages: ChatMessage[];
	options?: GenerationOptions;
}

/** One NDJSON line of a streamed `/api/chat` response. */
export interface ChatStreamChunk {
	message?: ChatMessage;
	done?: boolean;
	error?: string;
}

/**
 * Fill-in-the-middle request. `suffix` is what follows the cursor; models
 * without FIM support ignore it and complete from `prompt` alone.
 */
export interface GenerateRequest {
	model: string;
	prompt: string;
	suffix?: string;
	options?: GenerationOptions;
}

export interface GenerateResponse {
	response?: string;
	done?: boolean;
	error?: string;
}
