export type OllamaErrorKind =
	| 'invalid-endpoint'
	| 'non-local-endpoint'
	| 'unreachable'
	| 'http'
	| 'malformed'
	| 'aborted';

export class OllamaError extends Error {
	constructor(
		readonly kind: OllamaErrorKind,
		message: string,
		readonly hint?: string,
	) {
		super(message);
		this.name = 'OllamaError';
	}
}

export function describeError(error: unknown): string {
	if (error instanceof OllamaError) {
		return error.hint ? `${error.message} ${error.hint}` : error.message;
	}

	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}
