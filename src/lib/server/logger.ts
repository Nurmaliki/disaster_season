import { config }  from '$lib/server/config.ts';

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[(config.logLevel as Level) in LEVELS ? (config.logLevel as Level) : 'info'];

export interface LogFields {
	provider?: string;
	endpoint?: string;
	durationMs?: number;
	status?: number | string;
	cache?: 'hit' | 'miss' | 'stale' | 'set' | 'bypass';
	error?: unknown;
	[key: string]: unknown;
}

/**
 * Structured JSON logger. Never logs secrets.
 * Coordinates are only logged as part of aggregated counts, never per-user.
 */
function emit(level: Level, message: string, fields: LogFields = {}): void {
	if (LEVELS[level] < threshold) return;

	const entry = {
		ts: new Date().toISOString(),
		level,
		msg: message,
		...fields,
		...(fields.error instanceof Error
			? { error: { name: fields.error.name, message: fields.error.message } }
			: fields.error !== undefined
				? { error: String(fields.error) }
				: {})
	};

	const line = JSON.stringify(entry);
	if (level === 'error' || level === 'warn') console.error(line);
	else console.log(line);
}

export const logger = {
	debug: (msg: string, fields?: LogFields) => emit('debug', msg, fields),
	info: (msg: string, fields?: LogFields) => emit('info', msg, fields),
	warn: (msg: string, fields?: LogFields) => emit('warn', msg, fields),
	error: (msg: string, fields?: LogFields) => emit('error', msg, fields)
};

/** Measures an async operation and logs the outcome. */
export async function timed<T>(
	message: string,
	fields: LogFields,
	fn: () => Promise<T>
): Promise<T> {
	const start = Date.now();
	try {
		const result = await fn();
		logger.debug(message, { ...fields, durationMs: Date.now() - start, status: 'ok' });
		return result;
	} catch (error) {
		logger.warn(message, { ...fields, durationMs: Date.now() - start, status: 'fail', error });
		throw error;
	}
}
