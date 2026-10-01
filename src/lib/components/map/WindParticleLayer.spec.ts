import { describe, expect, it } from 'vitest';
// The pure `sampleWind` helper lives in the component's module script so it can
// be unit-tested without mounting the canvas.
import { sampleWind } from '$lib/components/map/WindParticleLayer.svelte';
import type { WindSample } from '$lib/api/types';

function sample(latitude: number, longitude: number, u: number, v: number): WindSample {
	return { latitude, longitude, u, v, speedKmh: Math.hypot(u, v), fromDirection: null };
}

describe('wind field interpolation', () => {
	it('returns null when there are no samples', () => {
		expect(sampleWind(106, -6, [])).toBeNull();
	});

	it('returns the exact probe value when standing on it', () => {
		const samples = [sample(-6, 106, 10, 0)];
		const wind = sampleWind(106, -6, samples);
		expect(wind).toEqual({ u: 10, v: 0 });
	});

	it('blends two probes between them', () => {
		// Two probes pointing the same way, so any blend is still (5, 0).
		const samples = [sample(-6, 106, 5, 0), sample(-6.5, 106.5, 5, 0)];
		const wind = sampleWind(106.25, -6.25, samples);
		expect(wind?.u).toBeCloseTo(5, 5);
		expect(wind?.v).toBeCloseTo(0, 5);
	});

	it('weights the nearer probe more heavily', () => {
		const samples = [sample(-6, 106, 10, 0), sample(-6, 116, -10, 0)];
		const wind = sampleWind(107, -6, samples);
		// Much closer to the first (east-blowing) probe.
		expect(wind!.u).toBeGreaterThan(0);
	});

	it('reports no data far outside the probing lattice', () => {
		const samples = [sample(-6, 106, 10, 0)];
		// Central Africa — hundreds of degrees from any probe.
		expect(sampleWind(20, 10, samples)).toBeNull();
	});
});
