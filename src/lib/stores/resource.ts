import { writable, type Readable } from 'svelte/store';
import { browser } from '$app/environment';
import { errorMessage } from '$lib/api/client';

/**
 * Minimal async resource store.
 *
 * Provides the three states the UI actually needs (loading / error / data) and
 * guarantees the app NEVER crashes on a provider failure: an error is captured
 * into state and the previous data is retained, so a transient outage shows a
 * non-blocking warning instead of an empty screen.
 */

export interface ResourceState<T> {
	data: T | null;
	loading: boolean;
	error: string | null;
	/** True while a background refresh is in flight but data is already shown. */
	refreshing: boolean;
}

export interface Resource<T> extends Readable<ResourceState<T>> {
	/** Runs the loader. Safe to call repeatedly (used by polling and manual refresh). */
	load: (options?: { silent?: boolean }) => Promise<void>;
	/** Applies a local mutation to the current data without a network call. */
	set: (data: T) => void;
	/** Stops polling and aborts any in-flight request. */
	destroy: () => void;
}

export interface ResourceOptions {
	/** Re-run the loader on this interval while the tab is visible. */
	pollMs?: number;
	/** Start loading immediately on creation (browser only). */
	immediate?: boolean;
}

export function createResource<T>(
	loader: (signal: AbortSignal) => Promise<T>,
	options: ResourceOptions = {}
): Resource<T> {
	const { pollMs, immediate = true } = options;

	const state = writable<ResourceState<T>>({
		data: null,
		loading: immediate,
		error: null,
		refreshing: false
	});

	let controller: AbortController | null = null;
	let timer: ReturnType<typeof setInterval> | null = null;
	let hasLoaded = false;

	async function load(options: { silent?: boolean } = {}): Promise<void> {
		controller?.abort();
		controller = new AbortController();
		const signal = controller.signal;

		state.update((current) => ({
			...current,
			loading: !options.silent && !hasLoaded,
			refreshing: options.silent || hasLoaded,
			error: null
		}));

		try {
			const data = await loader(signal);
			if (signal.aborted) return;
			hasLoaded = true;
			state.set({ data, loading: false, error: null, refreshing: false });
		} catch (error) {
			if (signal.aborted) return;
			// Keep whatever data we already had so the UI degrades gracefully.
			state.update((current) => ({
				...current,
				loading: false,
				refreshing: false,
				error: errorMessage(error)
			}));
		}
	}

	if (browser && immediate) {
		void load();
	}

	if (browser && pollMs && pollMs > 0) {
		timer = setInterval(() => {
			if (document.visibilityState === 'visible') void load({ silent: true });
		}, pollMs);
	}

	const onOnline = (): void => void load({ silent: true });
	if (browser) window.addEventListener('online', onOnline);

	return {
		subscribe: state.subscribe,
		load,
		set: (data: T) => state.set({ data, loading: false, error: null, refreshing: false }),
		destroy: () => {
			controller?.abort();
			if (timer) clearInterval(timer);
			if (browser) window.removeEventListener('online', onOnline);
		}
	};
}
