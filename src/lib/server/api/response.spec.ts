import { describe, it, expect } from 'vitest';
import {
	apiSuccess,
	apiFailure,
	classifyError,
	checkRateLimit,
	clientKey
} from '$lib/server/api/response';
import { HttpError } from '$lib/server/http';

/**
 * The API envelope and error classification are the contract every endpoint
 * depends on. These tests guarantee the shape clients rely on stays stable, and
 * that provider failures are classified into safe, non-crashing responses.
 */

describe('apiSuccess', () => {
	it('wraps data in a success envelope with metadata', async () => {
		const updatedAt = new Date().toISOString();
		const response = apiSuccess([1, 2, 3], { source: 'Test', updatedAt, cached: true });
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.success).toBe(true);
		expect(body.data).toEqual([1, 2, 3]);
		expect(body.meta.source).toBe('Test');
		expect(body.meta.updatedAt).toBe(updatedAt);
		expect(body.meta.cached).toBe(true);
	});

	it('defaults cached to false when not supplied', async () => {
		const response = apiSuccess(
			{ ok: true },
			{ source: 'Test', updatedAt: new Date().toISOString() }
		);
		const body = await response.json();
		expect(body.meta.cached).toBe(false);
	});
});

describe('apiFailure', () => {
	it('produces a failure envelope with the given status and code', async () => {
		const response = apiFailure('VALIDATION_ERROR', 'Parameter salah', 400);
		expect(response.status).toBe(400);
		const body = await response.json();
		expect(body.success).toBe(false);
		expect(body.error.code).toBe('VALIDATION_ERROR');
		expect(body.error.message).toBe('Parameter salah');
	});

	it('defaults to 500', () => {
		expect(apiFailure('PROVIDER_ERROR', 'x').status).toBe(500);
	});
});

describe('classifyError', () => {
	it('maps a timeout HttpError to 504', () => {
		const result = classifyError(new HttpError('timed out', 504, 'TIMEOUT'));
		expect(result.code).toBe('TIMEOUT');
		expect(result.status).toBe(504);
	});

	it('maps a rate-limit HttpError to 429', () => {
		expect(classifyError(new HttpError('slow down', 429, 'RATE_LIMIT')).status).toBe(429);
	});

	it('maps a not-found HttpError to 404', () => {
		expect(classifyError(new HttpError('missing', 404, 'NOT_FOUND')).status).toBe(404);
	});

	it('maps a network HttpError to 503', () => {
		expect(classifyError(new HttpError('no route', 0, 'NETWORK_ERROR')).status).toBe(503);
	});

	it('maps an unknown error to a 500 provider error with a safe message', () => {
		const result = classifyError(new Error('boom'));
		expect(result.code).toBe('PROVIDER_ERROR');
		expect(result.status).toBe(500);
		// The raw message must not leak through.
		expect(result.message).not.toContain('boom');
	});

	it('detects abort-style errors as timeouts', () => {
		expect(classifyError(new Error('The operation was aborted')).code).toBe('TIMEOUT');
	});
});

describe('checkRateLimit', () => {
	it('allows requests under the limit and reports the remainder', () => {
		const key = `test-${Math.random()}`;
		const first = checkRateLimit(key, { windowMs: 1000, max: 3 });
		expect(first.allowed).toBe(true);
		expect(first.remaining).toBe(2);
	});

	it('denies requests over the limit with a retry hint', () => {
		const key = `test-over-${Math.random()}`;
		for (let i = 0; i < 3; i++) checkRateLimit(key, { windowMs: 60_000, max: 3 });
		const denied = checkRateLimit(key, { windowMs: 60_000, max: 3 });
		expect(denied.allowed).toBe(false);
		expect(denied.retryAfterSeconds).toBeGreaterThan(0);
	});
});

describe('clientKey', () => {
	it('uses the first forwarded address', () => {
		const request = new Request('https://x.test', {
			headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' }
		});
		expect(clientKey(request, 'dashboard')).toBe('dashboard:203.0.113.5');
	});

	it('falls back to unknown when no address header is present', () => {
		const request = new Request('https://x.test');
		expect(clientKey(request, 'dashboard')).toBe('dashboard:unknown');
	});
});
