import { describe, it, expect } from 'vitest';
import { uniqueBy } from '$lib/utils/collections';

/**
 * `uniqueBy` is a rendering safety net: keyed Svelte `{#each}` blocks throw on
 * duplicate keys, so we guarantee uniqueness before the list ever reaches the
 * template. These tests lock in the "first wins, order preserved" contract.
 */
describe('uniqueBy', () => {
	it('removes duplicate keys keeping the first occurrence', () => {
		const items = [
			{ id: 'a', v: 1 },
			{ id: 'b', v: 2 },
			{ id: 'a', v: 3 }
		];
		expect(uniqueBy(items, (i) => i.id)).toEqual([
			{ id: 'a', v: 1 },
			{ id: 'b', v: 2 }
		]);
	});

	it('preserves the original ordering', () => {
		const items = [{ id: 'z' }, { id: 'a' }, { id: 'm' }];
		expect(uniqueBy(items, (i) => i.id).map((i) => i.id)).toEqual(['z', 'a', 'm']);
	});

	it('keeps every distinct item', () => {
		const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
		expect(uniqueBy(items, (i) => i.id)).toHaveLength(3);
	});

	it('does not collapse items with missing keys onto one another', () => {
		const items = [{ id: null }, { id: undefined }, { id: '' }];
		expect(uniqueBy(items, (i) => i.id)).toHaveLength(3);
	});

	it('uses the provided fallback key when a key is missing', () => {
		const items = [{ id: '' }, { id: '' }];
		const result = uniqueBy(items, (i) => i.id, { defaultKey: (_, index) => `fallback-${index}` });
		expect(result).toHaveLength(2);
	});

	it('returns an empty array for empty input', () => {
		expect(uniqueBy([], (i: { id: string }) => i.id)).toEqual([]);
	});

	it('does not mutate the input array', () => {
		const items = [{ id: 'a' }, { id: 'a' }];
		const copy = [...items];
		uniqueBy(items, (i) => i.id);
		expect(items).toEqual(copy);
	});
});
