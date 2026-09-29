<script lang="ts">
	import type { RiskAssessment } from '$lib/types';
	import { ShieldAlert, Info } from 'lucide-svelte';

	/**
	 * Internal Risk Score display.
	 *
	 * This component MUST always render the disclaimer. The score is an
	 * application indicator derived from available data — never an official
	 * warning from BMKG, BNPB, BPBD or PVMBG.
	 */
	interface Props {
		assessment: RiskAssessment;
		/** Show the factor breakdown table. */
		showFactors?: boolean;
		compact?: boolean;
	}

	let { assessment, showFactors = false, compact = false }: Props = $props();

	const LEVEL_TOKENS = {
		low: {
			label: 'Rendah',
			bg: 'bg-emerald-100 dark:bg-emerald-950',
			text: 'text-emerald-800 dark:text-emerald-300',
			ring: '#059669'
		},
		moderate: {
			label: 'Sedang',
			bg: 'bg-amber-100 dark:bg-amber-950',
			text: 'text-amber-900 dark:text-amber-300',
			ring: '#d97706'
		},
		high: {
			label: 'Tinggi',
			bg: 'bg-orange-100 dark:bg-orange-950',
			text: 'text-orange-900 dark:text-orange-300',
			ring: '#ea580c'
		},
		very_high: {
			label: 'Sangat Tinggi',
			bg: 'bg-red-100 dark:bg-red-950',
			text: 'text-red-900 dark:text-red-300',
			ring: '#b91c1c'
		}
	} as const;

	const token = $derived(LEVEL_TOKENS[assessment.level]);

	// SVG donut geometry. Deterministic: derived only from the score.
	const radius = 34;
	const circumference = 2 * Math.PI * radius;
	const offset = $derived(circumference * (1 - assessment.score / 100));
</script>

<div class="card p-4">
	<div class="flex items-center gap-4">
		<!-- Donut showing the 0–100 internal score. -->
		<div class="relative shrink-0" style="width:84px;height:84px">
			<svg
				viewBox="0 0 80 80"
				class="h-full w-full -rotate-90"
				role="img"
				aria-label={`Skor risiko internal ${assessment.score} dari 100, kategori ${token.label}`}
			>
				<circle cx="40" cy="40" r={radius} fill="none" stroke="var(--border)" stroke-width="8" />
				<circle
					cx="40"
					cy="40"
					r={radius}
					fill="none"
					stroke={token.ring}
					stroke-width="8"
					stroke-linecap="round"
					stroke-dasharray={circumference}
					stroke-dashoffset={offset}
				/>
			</svg>
			<div class="absolute inset-0 flex flex-col items-center justify-center">
				<span class="text-xl font-bold tabular-nums" style="color:{token.ring}"
					>{assessment.score}</span
				>
				<span class="text-subtle text-[9px] tracking-wide uppercase">/ 100</span>
			</div>
		</div>

		<div class="min-w-0 flex-1">
			<div class="flex flex-wrap items-center gap-2">
				<h3 class="text-sm font-semibold">Skor Risiko (Indikator Internal)</h3>
				<span class="rounded-full px-2 py-0.5 text-[11px] font-bold {token.bg} {token.text}">
					{token.label}
				</span>
			</div>

			{#if !compact}
				<p class="text-subtle mt-1 flex items-start gap-1 text-[11px]">
					<Info size={12} class="mt-0.5 shrink-0" aria-hidden="true" />
					<span>{assessment.disclaimer}</span>
				</p>
			{/if}
		</div>
	</div>

	{#if showFactors}
		<div class="mt-4">
			<p class="eyebrow mb-2">Rincian faktor penilaian</p>
			<ul class="space-y-1.5">
				{#each assessment.factors as factor (factor.key)}
					<li class="flex items-start gap-2 text-xs">
						<span
							class="mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full"
							style="background:{token.ring}"
						></span>
						<div class="min-w-0 flex-1">
							<div class="flex items-center justify-between gap-2">
								<span class="text-muted font-medium">{factor.label}</span>
								<span class="text-subtle tabular-nums"
									>{Math.round(factor.value * 100)}% × {Math.round(factor.weight * 100)}%</span
								>
							</div>
							<p class="text-subtle text-[11px]">{factor.reason}</p>
						</div>
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	{#if compact}
		<p class="text-subtle mt-2 flex items-start gap-1 text-[10px]">
			<ShieldAlert size={11} class="mt-0.5 shrink-0" aria-hidden="true" />
			<span>{assessment.disclaimer}</span>
		</p>
	{/if}
</div>
