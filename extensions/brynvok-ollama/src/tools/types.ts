import type { OllamaTool } from '../ollama/types';
import type { ParsedToolCall } from './parse';

export type ToolKind = 'read' | 'propose_edit' | 'propose_command';

export interface ToolExecutionContext {
	log: (line: string) => void;
}

export interface ToolRunResult {
	/** Text fed back to the model as the tool response. */
	content: string;
	/** Optional card shown in the chat UI. */
	card?: ToolCard;
	/** When true the agent loop stops after this turn so the user can act. */
	awaitUser?: boolean;
}

export type ToolCard =
	| {
			kind: 'edit';
			proposalId: string;
			path: string;
			isNew: boolean;
			summary: string;
			diff: string;
	  }
	| {
			kind: 'command';
			proposalId: string;
			command: string;
			cwd: string;
	  }
	| {
			kind: 'info';
			title: string;
			body: string;
	  };

export interface WorkspaceTool {
	definition: OllamaTool;
	kind: ToolKind;
	run: (call: ParsedToolCall, context: ToolExecutionContext) => Promise<ToolRunResult>;
}
