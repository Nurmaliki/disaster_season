import type { ApiFailure, ApiSuccess } from '$lib/types';

/**
 * Typed browser-side API client.
 *
 * The browser NEVER calls an external provider directly — every request goes to
 * our own /api/* gateway, which enforces validation, caching and rate limits.
 * This module is the single place the frontend talks to the network.
 */

export class ApiClientError extends Error {
	readonly code: ApiFailure['error']['code'];
	readonly status: number;

	constructor(code: ApiFailure['error']['code'], message: string, status: number) {
		super(message);
		this.name = 'ApiClientError';
		this.code = code;
		this.status = status;
	}
}

export interface FetchOptions {
	/** Abort the request after this many milliseconds. */
	timeoutMs?: number;
	signal?: AbortSignal;
	/** Number of retries for transient (network/5xx) failures. */
	retries?: number;
}

/**
 * Performs a GET request against our API gateway and unwraps the envelope.
 * Throws a typed {@link ApiClientError} for failures so callers can branch on
 * the error code instead of parsing messages.
 */
export async function apiGet<T>(
	path: string,
	params: Record<string, string | number | undefined | null> = {},
	options: FetchOptions = {}
): Promise<ApiSuccess<T>> {
	const { timeoutMs = 15000, retries = 1, signal } = options;

	const url = new URL(path, typeof location !== 'undefined' ? location.origin : 'http://localhost');
	for (const [key, value] of Object.entries(params)) {
		if (value === undefined || value === null || value === '') continue;
		url.searchParams.set(key, String(value));
	}

	let lastError: unknown;

	for (let attempt = 0; attempt <= retries; attempt++) {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);

		// Chain an external signal (e.g. component teardown) onto ours.
		const onAbort = (): void => controller.abort();
		signal?.addEventListener('abort', onAbort, { once: true });

		try {
			const response = await fetch(url.toString(), {
				method: 'GET',
				headers: { accept: 'application/json' },
				signal: controller.signal
			});

			const text = await response.text();
			let body: unknown;
			try {
				body = JSON.parse(text);
			} catch {
				throw new ApiClientError(
					'PROVIDER_ERROR',
					'Respons server tidak dapat dibaca.',
					response.status
				);
			}

			if (!response.ok || (body as ApiFailure).success === false) {
				const failure = body as ApiFailure;
				// 4xx errors are terminal; retrying will not help.
				const retryable = response.status >= 500;
				const error = new ApiClientError(
					failure.error?.code ?? 'PROVIDER_ERROR',
					failure.error?.message ?? 'Terjadi kesalahan pada server.',
					response.status
				);
				if (!retryable || attempt === retries) throw error;
				lastError = error;
			} else {
				return body as ApiSuccess<T>;
			}
		} catch (error) {
			// An explicit caller abort should propagate immediately.
			if (signal?.aborted) throw error;

			if (error instanceof ApiClientError && error.status < 500) throw error;

			lastError = error;
			if (attempt === retries) break;

			// Exponential backoff, small and bounded.
			await sleep(200 * 2 ** attempt);
		} finally {
			clearTimeout(timer);
			signal?.removeEventListener('abort', onAbort);
		}
	}

	if (lastError instanceof ApiClientError) throw lastError;

	if (lastError instanceof Error && lastError.name === 'AbortError') {
		throw new ApiClientError('TIMEOUT', 'Permintaan melebihi batas waktu.', 504);
	}

	throw new ApiClientError(
		'NETWORK_ERROR',
		'Tidak dapat menghubungi server. Periksa koneksi Anda.',
		0
	);
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Normalises any thrown value into a user-presentable message. */
export function errorMessage(error: unknown): string {
	if (error instanceof ApiClientError) return error.message;
	if (error instanceof Error && error.message) return error.message;
	return 'Terjadi kesalahan yang tidak diketahui.';
}
