import { logger }  from '$lib/server/logger';

export class HttpError extends Error {
	readonly status: number;
	readonly code: 'NETWORK_ERROR' | 'PROVIDER_ERROR' | 'TIMEOUT' | 'RATE_LIMIT' | 'NOT_FOUND';

	constructor(
		message: string,
		status: number,
		code: 'NETWORK_ERROR' | 'PROVIDER_ERROR' | 'TIMEOUT' | 'RATE_LIMIT' | 'NOT_FOUND'
	) {
		super(message);
		this.name = 'HttpError';
		this.status = status;
		this.code = code;
	}
}

export interface FetchOptions {
	timeoutMs?: number;
	retries?: number;
	headers?: Record<string, string>;
	/** Deduplicate identical in-flight GET requests. */
	dedupe?: boolean;
	/** Parse the response; defaults to JSON. Return `null` to skip body parsing. */
	parse?: 'json' | 'text' | 'none';
	accept?: string;
	method?: 'GET' | 'POST';
	body?: string;
}

interface InflightEntry {
	promise: Promise<unknown>;
	createdAt: number;
}

/**
 * Module-level de-duplication table. Two concurrent requests for the exact same
 * URL share a single upstream call. This is the main protection against a
 * page with many widgets hammering BMKG simultaneously.
 */
const inflight = new Map<string, InflightEntry>();
const INFLIGHT_TTL_MS = 30_000;

function isRetryable(status: number): boolean {
	return status === 408 || status === 429 || status >= 500;
}

function backoff(attempt: number): number {
	return Math.min(250 * 2 ** attempt, 2_000);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) return reject(new HttpError('Aborted', 499, 'TIMEOUT'));
		const timer = setTimeout(() => {
			signal?.removeEventListener('abort', onAbort);
			resolve();
		}, ms);
		const onAbort = () => {
			clearTimeout(timer);
			reject(new HttpError('Aborted', 499, 'TIMEOUT'));
		};
		signal?.addEventListener('abort', onAbort, { once: true });
	});
}

/**
 * Fetch helper used by every provider.
 * Guarantees: hard timeout, bounded retries with backoff, dedupe, structured logging.
 * Never throws a non-HttpError so callers can classify failures reliably.
 */
export async function fetchJson<T = unknown>(
	url: string,
	options: FetchOptions = {}
): Promise<{ data: T; status: number; durationMs: number }> {
	const {
		timeoutMs = 12_000,
		retries = 2,
		headers = {},
		dedupe = true,
		parse = 'json',
		accept = 'application/json',
		method = 'GET',
		body
	} = options;

	const key = `${method} ${url}`;
	if (dedupe && method === 'GET') {
		const existing = inflight.get(key);
		if (existing && Date.now() - existing.createdAt < INFLIGHT_TTL_MS) {
			logger.debug('http dedupe hit', { endpoint: url, cache: 'hit' });
			return existing.promise as Promise<{ data: T; status: number; durationMs: number }>;
		}
	}

	const run = async (): Promise<{ data: T; status: number; durationMs: number }> => {
		let lastError: HttpError | null = null;

		for (let attempt = 0; attempt <= retries; attempt++) {
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), timeoutMs);
			const start = Date.now();

			try {
				const response = await fetch(url, {
					method,
					body,
					headers: {
						accept,
						'user-agent':
							'IndonesiaDisasterMonitor/1.0 (+https://github.com/; public-safety dashboard)',
						...headers
					},
					signal: controller.signal,
					redirect: 'follow'
				});

				const durationMs = Date.now() - start;

				if (!response.ok) {
					if (isRetryable(response.status) && attempt < retries) {
						logger.warn('http retryable status', {
							endpoint: url,
							status: response.status,
							attempt,
							durationMs
						});
						await sleep(backoff(attempt));
						continue;
					}
					throw new HttpError(
						`Upstream responded ${response.status}`,
						response.status,
						response.status === 404 ? 'NOT_FOUND' : response.status === 429 ? 'RATE_LIMIT' : 'PROVIDER_ERROR'
					);
				}

				let data: T;
				if (parse === 'text') data = (await response.text()) as unknown as T;
				else if (parse === 'none') data = null as unknown as T;
				else data = (await response.json()) as T;

				logger.debug('http ok', { endpoint: url, status: response.status, durationMs });
				return { data, status: response.status, durationMs };
			} catch (error) {
				const durationMs = Date.now() - start;
				if (error instanceof HttpError && !isRetryable(error.status)) {
					lastError = error;
					break;
				}

				const isAbort = error instanceof Error && error.name === 'AbortError';
				lastError =
					error instanceof HttpError
						? error
						: isAbort
							? new HttpError(`Request timed out after ${timeoutMs}ms`, 408, 'TIMEOUT')
							: new HttpError(
									error instanceof Error ? error.message : 'Unknown network failure',
									0,
									'NETWORK_ERROR'
								);

				if (attempt < retries) {
					logger.warn('http retry', {
						endpoint: url,
						attempt,
						durationMs,
						error: lastError.message
					});
					await sleep(backoff(attempt));
					continue;
				}
			} finally {
				clearTimeout(timer);
			}
		}

		throw lastError ?? new HttpError('Request failed', 0, 'NETWORK_ERROR');
	};

	const promise = run();
	if (dedupe && method === 'GET') {
		inflight.set(key, { promise, createdAt: Date.now() });
		promise.finally(() => {
			// Keep the entry briefly so bursts collapse, then release.
			setTimeout(() => {
				if (inflight.get(key)?.promise === promise) inflight.delete(key);
			}, 500);
		}).catch(() => {});
		promise.catch(() => {});
	}

	return promise;
}
