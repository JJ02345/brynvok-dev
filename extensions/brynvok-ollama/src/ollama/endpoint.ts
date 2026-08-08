import { OllamaError } from './errors';

/**
 * IPv6 loopback arrives from the URL parser wrapped in brackets, and the whole
 * 127.0.0.0/8 block is loopback rather than just 127.0.0.1.
 */
function isLoopback(hostname: string): boolean {
	const host = hostname.toLowerCase();

	if (host === 'localhost' || host === '::1' || host === '[::1]') {
		return true;
	}

	return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}

/**
 * Turns the configured endpoint into a URL, refusing anything off this machine
 * unless the user opted in. This is the single point that decides whether a
 * prompt may leave the device, so it stays deliberately narrow.
 */
export function parseEndpoint(raw: string, allowNonLocal: boolean): URL {
	let url: URL;

	try {
		url = new URL(raw);
	} catch {
		throw new OllamaError(
			'invalid-endpoint',
			`"${raw}" is not a valid URL.`,
			'Expected something like http://127.0.0.1:11434.',
		);
	}

	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new OllamaError(
			'invalid-endpoint',
			`Unsupported protocol "${url.protocol}".`,
			'Only http and https are supported.',
		);
	}

	if (!allowNonLocal && !isLoopback(url.hostname)) {
		throw new OllamaError(
			'non-local-endpoint',
			`The endpoint "${url.host}" is not on this machine.`,
			'Enable brynvok.ai.allowNonLocalEndpoint if sending code there is intended.',
		);
	}

	return url;
}
