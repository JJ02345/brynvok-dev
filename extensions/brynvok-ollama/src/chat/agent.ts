import type { BrynvokConfig } from '../config';
import type { OllamaClient } from '../ollama/client';
import type { ChatMessage, ToolCall } from '../ollama/types';
import { parseAssistantTurn } from '../tools/parse';
import { AGENT_SYSTEM_ADDENDUM, type ToolRegistry } from '../tools/registry';
import type { ToolCard } from '../tools/types';
import type { ChatSession } from './session';

export interface AgentEventSink {
	onAssistantStart(): void;
	onAssistantText(text: string): void;
	onAssistantDone(): void;
	onToolCard(card: ToolCard): void;
	onStatus(text: string): void;
}

const DEFAULT_MAX_ROUNDS = 8;

/**
 * Runs one user turn through as many model/tool rounds as needed. Read tools
 * execute immediately; edit and command tools only create proposals and pause
 * so the user can Apply or Run from the chat UI.
 */
export async function runAgentTurn(options: {
	client: OllamaClient;
	session: ChatSession;
	registry: ToolRegistry;
	config: BrynvokConfig;
	signal: AbortSignal;
	events: AgentEventSink;
	log: (line: string) => void;
}): Promise<void> {
	const { client, session, registry, config, signal, events, log } = options;
	const maxRounds = config.chat.maxToolRounds > 0 ? config.chat.maxToolRounds : DEFAULT_MAX_ROUNDS;
	const tools = registry.definitions();
	const systemPrompt = joinPrompts(config.chat.systemPrompt, AGENT_SYSTEM_ADDENDUM);

	for (let round = 0; round < maxRounds; round++) {
		if (signal.aborted) {
			return;
		}

		events.onStatus(round === 0 ? 'Thinking…' : `Tool round ${round + 1}…`);

		const message = await client.chat(
			{
				model: config.chat.model,
				messages: session.toRequestMessages(systemPrompt, config.chat.historyLimit),
				options: { temperature: config.chat.temperature },
				tools,
			},
			signal,
		);

		const parsed = parseAssistantTurn(message);

		if (parsed.content) {
			events.onAssistantStart();
			events.onAssistantText(parsed.content);
			events.onAssistantDone();
		}

		if (parsed.toolCalls.length === 0) {
			if (parsed.content) {
				session.append('assistant', parsed.content);
			} else if (message.content) {
				// Model returned only markup we could not parse as a tool call.
				events.onAssistantStart();
				events.onAssistantText(message.content);
				events.onAssistantDone();
				session.append('assistant', message.content);
			}

			return;
		}

		const assistantRecord: ChatMessage = {
			role: 'assistant',
			content: parsed.content,
			tool_calls: parsed.toolCalls.map(
				(call): ToolCall => ({
					function: {
						name: call.name,
						arguments: call.arguments,
					},
				}),
			),
		};
		session.appendMessage(assistantRecord);

		let awaitUser = false;

		for (const call of parsed.toolCalls) {
			if (signal.aborted) {
				return;
			}

			events.onStatus(`Running ${call.name}…`);
			const result = await registry.execute(call, { log });

			if (result.card) {
				events.onToolCard(result.card);
			}

			session.appendMessage({
				role: 'tool',
				tool_name: call.name,
				content: result.content,
			});

			if (result.awaitUser) {
				awaitUser = true;
			}
		}

		if (awaitUser) {
			events.onStatus('Waiting for Apply / Run…');
			return;
		}
	}

	events.onAssistantStart();
	events.onAssistantText('Stopped after too many tool rounds. Ask again to continue.');
	events.onAssistantDone();
}

function joinPrompts(base: string, addendum: string): string {
	const trimmed = base.trim();
	return trimmed ? `${trimmed}\n\n${addendum}` : addendum;
}
