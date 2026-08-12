import type { ChatMessage, ChatRole } from '../ollama/types';

export class ChatSession {
	private messages: ChatMessage[] = [];

	append(role: ChatRole, content: string): void {
		this.messages.push({ role, content });
	}

	appendMessage(message: ChatMessage): void {
		this.messages.push(message);
	}

	clear(): void {
		this.messages = [];
	}

	/**
	 * The system prompt is prepended on every turn rather than stored, so that
	 * editing the setting takes effect without restarting the conversation.
	 * Only the tail of the history is sent to keep the prompt bounded.
	 */
	toRequestMessages(systemPrompt: string, historyLimit: number): ChatMessage[] {
		const recent = this.messages.slice(-historyLimit);
		const trimmedPrompt = systemPrompt.trim();

		return trimmedPrompt ? [{ role: 'system', content: trimmedPrompt }, ...recent] : recent;
	}
}
