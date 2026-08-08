export type WebviewToHost =
	| { type: 'ready' }
	| { type: 'prompt'; text: string; includeSelection: boolean }
	| { type: 'abort' }
	| { type: 'clear' }
	| { type: 'pickModel' };

export type HostToWebview =
	| { type: 'state'; model: string; busy: boolean }
	| { type: 'user'; text: string }
	| { type: 'start' }
	| { type: 'delta'; text: string }
	| { type: 'done' }
	| { type: 'error'; message: string }
	| { type: 'cleared' };
