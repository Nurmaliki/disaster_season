<script lang="ts">
	import { untrack } from 'svelte';
	import type { PageData } from './$types';
	import { apiGet } from '$lib/api/client';
	import type { StatusPayload } from '$lib/api/types';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import DataStatusBar from '$lib/components/ui/DataStatusBar.svelte';
	import ErrorPanel from '$lib/components/ui/ErrorPanel.svelte';
	import { formatDateTime, formatRelative } from '$lib/utils/format';
	import { RefreshCw, CheckCircle2, AlertTriangle, XCircle, CircleDashed } from 'lucide-svelte';

	let { data }: { data: PageData } = $props();

	const seed = untrack(() => data);

	let status = $state<StatusPayload>(seed.status);
	let error = $state<string | null>(seed.error);
	let refreshing = $state(false);
	let probing = $state(false);

	const STATUS_META: Record<string, { label: string; icon: typeof CheckCircle2; tone: string }> = {
		online: { label: 'Aktif', icon: CheckCircle2, tone: 'text-emerald-600 dark:text-emerald-400' },
		degraded: { label: 'Menurun', icon: AlertTriangle, tone: 'text-amber-600 dark:text-amber-400' },
		offline: { label: 'Tidak tersedia', icon: XCircle, tone: 'text-red-600 dark:text-red-400' },
		unconfigured: { label: 'Belum diuji', icon: CircleDashed, tone: 'text-slate-500' }
	};

	async function refresh(probe = false): Promise<void> {
		if (probe) probing = true;
		else refreshing = true;
		try {
			const response = await apiGet<StatusPayload>('/api/status', probe ? { probe: '1' } : {});
			status = response.data;
			error = null;
		} catch {
			error = 'Status sistem tidak dapat dimuat.';
		} finally {
			refreshing = false;
			probing = false;
		}
	}
</script>

<svelte:head>
	<title>Status Sistem &amp; Sumber Data — Disaster Monitor</title>
	<meta name="description" content="Status kesehatan sumber data resmi yang digunakan aplikasi." />
</svelte:head>

<div class="space-y-4">
	<PageHeader
		title="Status Sistem"
		subtitle="Kesehatan setiap sumber data. Status hanya menunjukkan 'Aktif' setelah pemanggilan nyata berhasil — bukan diasumsikan."
	>
		{#snippet actions()}
			<button
				type="button"
				onclick={() => refresh(false)}
				disabled={refreshing}
				class="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium transition hover:border-[var(--border-strong)] disabled:opacity-60"
			>
				<RefreshCw size={13} class={refreshing ? 'animate-spin' : ''} aria-hidden="true" />
				Muat ulang
			</button>
			<button
				type="button"
				onclick={() => refresh(true)}
				disabled={probing}
				class="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium transition hover:border-[var(--border-strong)] disabled:opacity-60"
			>
				<RefreshCw size={13} class={probing ? 'animate-spin' : ''} aria-hidden="true" />
				Uji koneksi BMKG
			</button>
		{/snippet}
	</PageHeader>

	{#if error}
		<ErrorPanel message={error} retry={() => refresh()} />
	{/if}

	{#if status.liveProbe}
		<div class="card p-3">
			<p class="eyebrow mb-1">Hasil uji koneksi langsung</p>
			<pre class="text-subtle scroll-thin overflow-x-auto text-[11px]">{JSON.stringify(
					status.liveProbe,
					null,
					2
				)}</pre>
		</div>
	{/if}

	<div class="overflow-x-auto rounded-xl border border-[var(--border)]">
		<table class="w-full min-w-[640px] text-left text-xs">
			<thead class="surface-subtle">
				<tr>
					<th class="px-3 py-2 font-semibold">Sumber</th>
					<th class="px-3 py-2 font-semibold">Status</th>
					<th class="px-3 py-2 font-semibold">Latensi</th>
					<th class="px-3 py-2 font-semibold">Terakhir berhasil</th>
					<th class="px-3 py-2 font-semibold">Keterangan</th>
				</tr>
			</thead>
			<tbody>
				{#each status.providers as provider (provider.id)}
					{@const meta = STATUS_META[provider.status] ?? STATUS_META.unconfigured}
					{@const Icon = meta.icon}
					<tr class="border-t border-[var(--border)]">
						<td class="px-3 py-2">
							<p class="font-semibold">{provider.name}</p>
							<p class="text-subtle text-[10px]">{provider.attribution}</p>
						</td>
						<td class="px-3 py-2">
							<span class="inline-flex items-center gap-1 font-medium {meta.tone}">
								<Icon size={13} aria-hidden="true" />
								{meta.label}
							</span>
						</td>
						<td class="text-subtle px-3 py-2 tabular-nums">
							{provider.latencyMs !== null ? `${provider.latencyMs} ms` : '—'}
						</td>
						<td class="text-subtle px-3 py-2">
							{#if provider.lastSuccessAt}
								<span title={formatDateTime(provider.lastSuccessAt)}>
									{formatRelative(provider.lastSuccessAt)}
								</span>
							{:else}
								—
							{/if}
						</td>
						<td class="text-subtle px-3 py-2">
							{provider.lastError ?? '—'}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<div class="card p-3">
		<p class="text-subtle text-[11px]">
			Status diperoleh dari hasil pemanggilan nyata dalam proses ini. Pada lingkungan serverless,
			catatan status bersifat sementara per-instans. Uji koneksi memeriksa keterjangkauan BMKG
			secara langsung.
		</p>
	</div>

	<DataStatusBar
		source="Registry kesehatan provider"
		updatedAt={new Date().toISOString()}
		cached={false}
	/>
</div>
