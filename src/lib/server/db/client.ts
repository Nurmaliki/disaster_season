import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '$lib/server/config';
import { logger } from '$lib/server/logger';
import * as schema from '$lib/server/db/schema';

/**
 * Optional database client.
 *
 * The app is stateless by default. This module returns `null` whenever
 * persistence is not configured, so every caller must handle the disabled case
 * explicitly — there is deliberately no "pretend DB" fallback that could mask a
 * misconfiguration.
 *
 * The connection is created lazily on first use and cached for the lifetime of
 * the instance. A connection failure degrades to `null` (stateless mode) rather
 * than throwing, so a database outage can never take the app down.
 */

export type Database = PostgresJsDatabase<typeof schema>;

let client: ReturnType<typeof postgres> | null = null;
let db: Database | null = null;
let initialised = false;

function createClient(): ReturnType<typeof postgres> {
	return postgres(config.database.url, {
		max: config.database.maxConnections,
		connect_timeout: Math.ceil(config.database.connectTimeoutMs / 1000),
		// Keep serverless-friendly defaults: no prepared statement cache issues.
		prepare: false,
		idle_timeout: 20,
		onnotice: () => {
			/* Silence NOTICE noise; real errors still surface via queries. */
		}
	});
}

/**
 * Returns the database handle, or `null` when persistence is disabled or the
 * connection could not be established. The result is cached, including the
 * `null` outcome, so we do not retry a broken connection on every request.
 */
export function getDatabase(): Database | null {
	if (initialised) return db;
	initialised = true;

	if (!config.database.enabled) {
		db = null;
		return db;
	}

	try {
		client = createClient();
		db = drizzle(client, { schema });
		logger.info('database persistence enabled', {
			scope: 'db',
			maxConnections: config.database.maxConnections,
			retentionDays: config.database.retentionDays
		});
		return db;
	} catch (error) {
		logger.error('database initialisation failed; continuing stateless', {
			scope: 'db',
			error
		});
		db = null;
		return db;
	}
}

/** True when a database is configured and the handle was created. */
export function isDatabaseEnabled(): boolean {
	return getDatabase() !== null;
}

/**
 * Runs a database operation, swallowing any failure and returning `fallback`.
 *
 * Every persistence call site goes through this so a database problem can only
 * ever cost us history — it can never break a request or crash the process.
 */
export async function safely<T>(operation: () => Promise<T>, fallback: T): Promise<T> {
	const database = getDatabase();
	if (!database) return fallback;

	try {
		return await operation();
	} catch (error) {
		logger.warn('database operation failed; using fallback', { scope: 'db', error });
		return fallback;
	}
}

/** Closes the pool. Intended for tests and graceful shutdown. */
export async function closeDatabase(): Promise<void> {
	if (client) {
		await client.end({ timeout: 5 });
		client = null;
		db = null;
		initialised = false;
	}
}
