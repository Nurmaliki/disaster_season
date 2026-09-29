import { json } from '@sveltejs/kit';
import type { ApiErrorCode, ApiFailure, ApiMeta, ApiSuccess } from '$lib/types';
import { HttpError } from '$lib/server/http';
import { logger } from '$lib/server/logger';

/**
 * Standard API envelope helpers.
 *
 * Every internal endpoint returns either:
 *   { success: true,  data, meta: { source, updatedAt, cached, ... } }
 *   { success: false, error: { code, message } }
 *
 * Success responses always carry provenance metadata so the UI can display
 * "sumber" and "terakhir diperbarui" without guessing.
 */

export function apiSuccess<T>(
	data: T,
	meta: Partial<ApiMeta> & Pick<ApiMeta, 'source' | 'updatedAt'>
): Response {
	const payload: ApiSuccess<T> = {
		success: true,
		data,
		meta: {
			cached: false,
			...meta
		}
	};
	return json(payload, {
		headers: responseHeaders()
	});
}

export function apiFailure(code: ApiErrorCode, message: string, status = 500): Response {
	const payload: ApiFailure = {
		success: false,
		error: { code, message }
	};
	return json(payload, {
		status,
		headers: responseHeaders()
	});
}

function responseHeaders(extra: Record<string, string> = {}): Record<string, string> {
	return {
		// Let Vercel's edge cache absorb bursts without serving stale HTML.
		'cache-control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=120',
		'x-content-type-options': 'nosniff',
		...extra
	};
}

/**
 * Maps any thrown error onto a stable API error code and status.
 *
 * Distinguishes the categories the spec requires (NETWORK_ERROR, PROVIDER_ERROR,
 * VALIDATION_ERROR, RATE_LIMIT, NOT_FOUND, DATABASE_ERROR, TIMEOUT) so the client
 * can react appropriately. Stack traces are never exposed in production.
 */
export function classifyError(error: unknown): {
	code: ApiErrorCode;
	message: string;
	status: number;
} {
	if (error instanceof HttpError) {
		switch (error.code) {
			case 'TIMEOUT':
				return {
					code: 'TIMEOUT',
					message: 'Sumber data tidak merespons tepat waktu. Data sementara tidak tersedia.',
					status: 504
				};
			case 'RATE_LIMIT':
				return {
					code: 'RATE_LIMIT',
					message: 'Batas permintaan sumber data tercapai. Coba beberapa saat lagi.',
					status: 429
				};
			case 'NOT_FOUND':
				return {
					code: 'NOT_FOUND',
					message: 'Data yang diminta tidak ditemukan pada sumber resmi.',
					status: 404
				};
			case 'NETWORK_ERROR':
				return {
					code: 'NETWORK_ERROR',
					message: 'Tidak dapat menghubungi sumber data. Data sementara tidak tersedia.',
					status: 503
				};
			default:
				return {
					code: 'PROVIDER_ERROR',
					message: 'Sumber data sedang bermasalah. Data sementara tidak tersedia.',
					status: 502
				};
		}
	}

	if (error instanceof Error && error.name === 'ZodError') {
		return {
			code: 'VALIDATION_ERROR',
			message: 'Parameter permintaan tidak valid.',
			status: 400
		};
	}

	if (error instanceof Error && /abort|timeout/i.test(error.message)) {
		return {
			code: 'TIMEOUT',
			message: 'Permintaan melebihi batas waktu.',
			status: 504
		};
	}

	return {
		code: 'PROVIDER_ERROR',
		message: 'Data sementara tidak tersedia.',
		status: 500
	};
}

/** Wraps a handler so provider failures never crash the endpoint. */
export async function handleApiError(error: unknown, context: string): Promise<Response> {
	const classified = classifyError(error);

	logger.error('api error', {
		context,
		code: classified.code,
		status: classified.status,
		error: error instanceof Error ? error.message : error
	});

	return apiFailure(classified.code, classified.message, classified.status);
}

/**
 * In-process sliding-window rate limiter.
 *
 * Purpose is to protect upstream providers and our own functions from runaway
 * clients, not to enforce account quotas. On serverless each instance limits
 * independently, which is acceptable for this purpose.
 */
const buckets = new Map<string, number[]>();

export interface RateLimitResult {
	allowed: boolean;
	remaining: number;
	retryAfterSeconds: number;
}

export function checkRateLimit(
	key: string,
	{ windowMs = 60_000, max = 120 }: { windowMs?: number; max?: number } = {}
): RateLimitResult {
	const now = Date.now();
	const timestamps = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);

	if (timestamps.length >= max) {
		const oldest = timestamps[0];
		return {
			allowed: false,
			remaining: 0,
			retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000))
		};
	}

	timestamps.push(now);
	buckets.set(key, timestamps);

	// Opportunistic cleanup to bound memory.
	if (buckets.size > 5000) {
		for (const [bucketKey, values] of buckets) {
			if (values.every((t) => now - t >= windowMs)) buckets.delete(bucketKey);
		}
	}

	return { allowed: true, remaining: max - timestamps.length, retryAfterSeconds: 0 };
}

/** Derives a rate-limit bucket key from the client, without storing precise location. */
export function clientKey(request: Request, scope: string): string {
	const forwarded = request.headers.get('x-forwarded-for');
	const ip = forwarded?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? 'unknown';
	return `${scope}:${ip}`;
}
