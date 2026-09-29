/**
 * Small collection helpers shared by the UI.
 *
 * These exist mainly as a rendering safety net: Svelte's keyed `{#each}` blocks
 * throw `each_key_duplicate` when two items resolve to the same key, which would
 * blank the entire page. Providers are already de-duplicated server-side, but a
 * defensive pass here means a data anomaly degrades gracefully instead of
 * destroying the view.
 */

/**
 * Returns a copy of `items` with duplicate keys removed.
 *
 * The first occurrence of each key wins and keeps its position, so the ordering
 * of the input (usually already sorted by relevance) is preserved. A
 * `defaultKey` is applied to items whose key is missing or empty so they never
 * all collapse to the same value.
 */
export function uniqueBy<T>(
	items: readonly T[],
	key: (item: T) => string | null | undefined,
	options: { defaultKey?: (item: T, index: number) => string } = {}
): T[] {
	const fallback = options.defaultKey ?? ((_, index: number) => `__item_${index}`);
	const seen = new Set<string>();
	const out: T[] = [];

	items.forEach((item, index) => {
		const raw = key(item);
		const resolved = raw && raw.length > 0 ? raw : fallback(item, index);
		if (seen.has(resolved)) return;
		seen.add(resolved);
		out.push(item);
	});

	return out;
}
