import type { ToolCard } from '../tools/types';

export type WebviewToHost =
	| { type: 'ready' }
	| { type: 'prompt'; text: string; includeSelection: boolean }
	| { type: 'abort' }
	| { type: 'clear' }
	| { type: 'pickModel' }
	| { type: 'applyProposal'; id: string }
	| { type: 'dismissProposal'; id: string }
	| { type: 'runProposal'; id: string };

export type HostToWebview =
	| { type: 'state'; model: string; busy: boolean }
	| { type: 'user'; text: string }
	| { type: 'start' }
	| { type: 'delta'; text: string }
	| { type: 'done' }
	| { type: 'error'; message: string }
	| { type: 'cleared' }
	| { type: 'status'; text: string }
	| { type: 'toolCard'; card: ToolCard }
	| { type: 'proposalStatus'; id: string; status: 'applied' | 'ran' | 'dismissed' | 'error'; message?: string };
