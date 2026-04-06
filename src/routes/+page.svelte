<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount, onDestroy } from 'svelte';
	import {
		type LoadUpdate,
		type TranscriptBlock,
		buildWaveformPeaks,
		decodeAudioFile,
		ensureTranscriber,
		transcribeAudio,
		DEFAULT_SAMPLE_RATE
	} from '$lib/transcriber';

	type RunSummary = {
		elapsedSeconds: number;
		blockCount: number;
		wordCount: number;
	};

	const languages = [
		{ code: 'en', label: 'English' },
		{ code: 'fr', label: 'French' },
		{ code: 'de', label: 'German' },
		{ code: 'es', label: 'Spanish' },
		{ code: 'it', label: 'Italian' },
		{ code: 'pt', label: 'Portuguese' },
		{ code: 'nl', label: 'Dutch' },
		{ code: 'pl', label: 'Polish' },
		{ code: 'ja', label: 'Japanese' },
		{ code: 'zh', label: 'Chinese' },
		{ code: 'ko', label: 'Korean' }
	];

	let fileInput: HTMLInputElement | null = $state(null);
	let selectedFile: File | null = $state(null);
	let selectedLanguage = $state('en');
	let audioUrl = $state('');
	let audioData: Float32Array | null = $state(null);
	let audioDuration = $state(0);
	let waveform: number[] = $state([]);
	let dragDepth = $state(0);
	let isDragActive = $state(false);

	let webgpuSupported = $state(false);

	let modelReady = $state(false);
	let modelStatus = $state('');
	let modelProgress = $state(0);

	let isDecoding = $state(false);
	let isLoadingModel = $state(false);
	let isTranscribing = $state(false);
	let transcriptionProgress = $state(0);
	let transcriptText = $state('');
	let transcriptBlocks: TranscriptBlock[] = $state([]);
	let runSummary: RunSummary | null = $state(null);
	let errorMessage = $state('');
	let copied = $state(false);
	let copyFeedbackTimer: ReturnType<typeof setTimeout> | null = $state(null);

	let hasFile = $derived(Boolean(selectedFile && audioData));
	let hasTranscript = $derived(transcriptText.trim().length > 0);
	let isBusy = $derived(isDecoding || isLoadingModel || isTranscribing);

	onMount(() => {
		if (!browser) return;
		webgpuSupported = typeof navigator !== 'undefined' && 'gpu' in navigator;
	});

	onDestroy(() => {
		revokeAudioUrl();
		if (copyFeedbackTimer) {
			clearTimeout(copyFeedbackTimer);
		}
	});

	function revokeAudioUrl() {
		if (audioUrl) {
			URL.revokeObjectURL(audioUrl);
			audioUrl = '';
		}
	}

	function resetTranscriptState() {
		transcriptText = '';
		transcriptBlocks = [];
		transcriptionProgress = 0;
		runSummary = null;
		copied = false;
	}

	function resetAppState() {
		revokeAudioUrl();
		selectedFile = null;
		audioData = null;
		audioDuration = 0;
		waveform = [];
		errorMessage = '';
		resetTranscriptState();
	}

	function applyLoadUpdate(update: LoadUpdate) {
		modelProgress = update.progress;
		modelStatus = update.statusText;
		if (update.ready) {
			modelReady = true;
		}
	}

	function openFilePicker() {
		fileInput?.click();
	}

	async function handleInputChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		await handleFileSelection(input.files);
		input.value = '';
	}

	async function handleFileSelection(files: FileList | null) {
		const file = files?.[0];
		if (!file || isBusy) return;

		errorMessage = '';
		resetTranscriptState();
		selectedFile = file;
		revokeAudioUrl();
		audioUrl = URL.createObjectURL(file);

		isDecoding = true;

		try {
			audioData = await decodeAudioFile(file, DEFAULT_SAMPLE_RATE);
			audioDuration = audioData.length / DEFAULT_SAMPLE_RATE;
			waveform = buildWaveformPeaks(audioData, 56);
		} catch (error) {
			audioData = null;
			audioDuration = 0;
			waveform = [];
			errorMessage = toErrorMessage(
				error,
				'This file could not be decoded. Try a different audio format.'
			);
		} finally {
			isDecoding = false;
		}
	}

	async function preloadModel() {
		if (!webgpuSupported || modelReady || isLoadingModel) return;

		errorMessage = '';
		isLoadingModel = true;
		modelProgress = 0;
		modelStatus = 'Preparing the local model…';

		try {
			await ensureTranscriber(applyLoadUpdate);
			modelReady = true;
			modelProgress = 100;
			modelStatus = 'Model ready';
		} catch (error) {
			errorMessage = toErrorMessage(
				error,
				'The model could not be loaded. Make sure WebGPU is enabled and refresh the page.'
			);
			modelStatus = 'Load failed';
		} finally {
			isLoadingModel = false;
		}
	}

	async function startTranscription() {
		if (!audioData || !selectedFile || isBusy) return;
		if (!webgpuSupported) {
			errorMessage = 'WebGPU is required but not available in this browser.';
			return;
		}

		errorMessage = '';
		resetTranscriptState();

		if (!modelReady) {
			await preloadModel();
			if (!modelReady) return;
		}

		const startedAt = performance.now();
		isTranscribing = true;
		transcriptionProgress = 2;

		try {
			const result = await transcribeAudio(audioData, selectedLanguage, (update) => {
				transcriptText = update.fullText;
				transcriptBlocks = update.blocks;
				transcriptionProgress = Math.round((update.completed / update.total) * 100);
			});

			transcriptText = result.text;
			transcriptBlocks = result.blocks;
			transcriptionProgress = 100;
			runSummary = {
				elapsedSeconds: (performance.now() - startedAt) / 1000,
				blockCount: result.blockCount,
				wordCount: countWords(result.text)
			};
		} catch (error) {
			errorMessage = toErrorMessage(error, 'Transcription failed.');
		} finally {
			isTranscribing = false;
		}
	}

	async function copyTranscript() {
		if (!hasTranscript || !browser) return;

		await navigator.clipboard.writeText(transcriptText);
		copied = true;

		if (copyFeedbackTimer) {
			clearTimeout(copyFeedbackTimer);
		}

		copyFeedbackTimer = setTimeout(() => {
			copied = false;
		}, 1800);
	}

	function downloadTranscript() {
		if (!hasTranscript) return;

		const blob = new Blob([transcriptText], { type: 'text/plain;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = `${exportBaseName(selectedFile?.name)}-transcript.txt`;
		anchor.click();
		URL.revokeObjectURL(url);
	}

	function handleDragEnter(event: DragEvent) {
		event.preventDefault();
		if (isBusy) return;
		dragDepth += 1;
		isDragActive = true;
	}

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
	}

	function handleDragLeave(event: DragEvent) {
		event.preventDefault();
		dragDepth = Math.max(0, dragDepth - 1);
		if (dragDepth === 0) {
			isDragActive = false;
		}
	}

	async function handleDrop(event: DragEvent) {
		event.preventDefault();
		dragDepth = 0;
		isDragActive = false;
		await handleFileSelection(event.dataTransfer?.files ?? null);
	}

	function formatBytes(size = 0) {
		if (size < 1024 * 1024) {
			return `${Math.round(size / 1024)} KB`;
		}
		return `${(size / (1024 * 1024)).toFixed(1)} MB`;
	}

	function formatDuration(seconds = 0) {
		if (seconds < 60) {
			return `${seconds.toFixed(1)}s`;
		}
		const minutes = Math.floor(seconds / 60);
		const remainder = seconds % 60;
		return `${minutes}m ${remainder.toFixed(0)}s`;
	}

	function exportBaseName(fileName?: string) {
		const name = (fileName ?? 'whimscribe').replace(/\.[^.]+$/, '');
		return name.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'whimscribe';
	}

	function countWords(text: string) {
		return text.trim().split(/\s+/).filter(Boolean).length;
	}

	function toErrorMessage(error: unknown, fallback: string) {
		return error instanceof Error ? error.message : fallback;
	}
</script>

<svelte:head>
	<title>Whimscribe</title>
	<meta name="description" content="Upload an audio file, transcribe it locally" />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Caveat:wght@400;600;700&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div
	class="relative min-h-screen px-4 py-8 md:px-6 md:py-12"
	role="presentation"
	ondragenter={handleDragEnter}
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
>
	<main class="relative mx-auto max-w-2xl">
		<!-- Header -->
		<header class="mb-10 text-center">
			<h1
				class="whimsy-text text-5xl text-(--ink) md:text-6xl"
				style="font-family: 'Caveat', cursive; font-weight: 700;"
			>
				Whimscribe
			</h1>
			<p class="mt-2 text-sm text-(--muted)">private audio transcription in your browser</p>
		</header>

		<!-- Step 1: Load Model -->
		<section class="mb-8">
			<div class="mb-3 flex items-center gap-2">
				<span class="whimsy-text text-lg text-(--accent)" style="font-family: 'Caveat', cursive;"
					>1.</span
				>
				<span class="text-sm font-medium text-(--ink-soft)">Load the model</span>
				{#if modelReady}
					<span
						class="ml-auto rounded-full bg-(--green-soft) px-2.5 py-0.5 text-xs font-medium text-(--green)"
					>
						ready ✓
					</span>
				{/if}
			</div>

			{#if !webgpuSupported}
				<div class="rounded-xl bg-(--accent-soft) px-4 py-3 text-sm text-(--accent)">
					WebGPU is not available. Try Chrome, Edge, or Safari with WebGPU enabled.
				</div>
			{:else if modelReady}
				<div class="rounded-xl bg-(--green-soft) px-4 py-3 text-sm text-(--green)">
					Model loaded and cached for this session.
				</div>
			{:else}
				<button
					type="button"
					class="w-full rounded-xl border-2 border-dashed border-(--border) bg-white/60 px-4 py-4 text-sm text-(--ink-soft) transition hover:border-(--accent) hover:bg-white/80 disabled:opacity-50"
					onclick={preloadModel}
					disabled={isLoadingModel}
				>
					{#if isLoadingModel}
						<div class="space-y-2">
							<span class="wiggle inline-block">⏳</span>
							<span>{modelStatus}</span>
							<div class="mx-auto h-1.5 max-w-xs overflow-hidden rounded-full bg-black/5">
								<div
									class="h-full rounded-full bg-(--accent) transition-all duration-300"
									style={`width:${modelProgress}%`}
								></div>
							</div>
						</div>
					{:else}
						<span>Click to load model</span>
						<span class="ml-1 text-(--muted)">· first time downloads ~2GB</span>
					{/if}
				</button>
			{/if}
		</section>

		<!-- Step 2: Upload Audio -->
		<section class="mb-8">
			<div class="mb-3 flex items-center gap-2">
				<span class="whimsy-text text-lg text-(--accent)" style="font-family: 'Caveat', cursive;"
					>2.</span
				>
				<span class="text-sm font-medium text-(--ink-soft)">Drop your audio</span>
				{#if selectedFile && audioData}
					<button
						type="button"
						class="ml-auto text-xs text-(--muted) underline decoration-dotted underline-offset-2 hover:text-(--accent)"
						onclick={resetAppState}
					>
						clear
					</button>
				{/if}
			</div>

			{#if selectedFile && audioData}
				<div class="fade-in rounded-xl border border-(--border) bg-white/70 px-4 py-4">
					<div class="flex items-center gap-3">
						<div
							class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-(--accent-soft) text-(--accent)"
						>
							<svg
								viewBox="0 0 24 24"
								class="h-5 w-5"
								fill="none"
								stroke="currentColor"
								stroke-width="1.8"
							>
								<path d="M9 18V5l12-2v13" stroke-linecap="round" stroke-linejoin="round" />
								<circle cx="6" cy="18" r="3" />
								<circle cx="18" cy="16" r="3" />
							</svg>
						</div>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium text-(--ink)">
								{selectedFile.name}
							</p>
							<p class="text-xs text-(--muted)">
								{formatBytes(selectedFile.size)} · {formatDuration(audioDuration)}
							</p>
						</div>
					</div>

					{#if waveform.length > 0}
						<div class="mt-3 flex h-12 items-end gap-[2px] rounded-lg bg-black/[0.02] px-2 py-2">
							{#each waveform as bar, index (index)}
								<div
									class="min-h-[12%] flex-1 rounded-full bg-(--accent)/40"
									style={`height:${bar}%`}
								></div>
							{/each}
						</div>
					{/if}

					{#if audioUrl}
						<audio class="mt-3 w-full" controls src={audioUrl}></audio>
					{/if}
				</div>
			{:else}
				<button
					type="button"
					class={`w-full rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${
						isDragActive
							? 'border-(--accent) bg-(--accent-soft)'
							: 'border-(--border) bg-white/50 hover:border-(--accent) hover:bg-white/70'
					}`}
					onclick={openFilePicker}
					disabled={isBusy}
				>
					{#if isDecoding}
						<p class="wiggle text-sm text-(--muted)">Analyzing audio…</p>
					{:else}
						<p
							class="whimsy-text text-2xl text-(--ink-soft)"
							style="font-family: 'Caveat', cursive;"
						>
							{isDragActive ? 'drop it right here!' : 'drop audio here…'}
						</p>
						<p class="mt-1 text-xs text-(--muted)">
							mp3, wav, m4a, or any browser-supported format
						</p>
					{/if}
				</button>
			{/if}
		</section>

		<!-- Step 3: Language -->
		<section class="mb-8">
			<div class="mb-3 flex items-center gap-2">
				<span class="whimsy-text text-lg text-(--accent)" style="font-family: 'Caveat', cursive;"
					>3.</span
				>
				<span class="text-sm font-medium text-(--ink-soft)">Pick a language</span>
			</div>

			<div class="flex flex-wrap gap-1.5">
				{#each languages as language (language.code)}
					<button
						type="button"
						class={`rounded-full px-3 py-1.5 text-sm transition ${
							selectedLanguage === language.code
								? 'bg-(--accent) text-white'
								: 'bg-white/60 text-(--ink-soft) hover:bg-white/90'
						}`}
						onclick={() => (selectedLanguage = language.code)}
					>
						{language.label}
					</button>
				{/each}
			</div>
		</section>

		<!-- Transcribe Button -->
		<section class="mb-10">
			<button
				type="button"
				class="w-full rounded-xl bg-(--accent) px-5 py-3.5 text-base font-semibold text-white transition hover:bg-(--accent-hover) disabled:cursor-not-allowed disabled:opacity-40"
				onclick={startTranscription}
				disabled={!hasFile || !webgpuSupported || isBusy}
			>
				{#if isTranscribing}
					Transcribing… {transcriptionProgress}%
				{:else if !modelReady && hasFile}
					Load model & transcribe
				{:else}
					Transcribe
				{/if}
			</button>

			{#if isTranscribing}
				<div class="mt-2 h-1 overflow-hidden rounded-full bg-black/5">
					<div
						class="h-full rounded-full bg-(--accent) transition-all duration-300"
						style={`width:${transcriptionProgress}%`}
					></div>
				</div>
			{/if}
		</section>

		<!-- Error -->
		{#if errorMessage}
			<div
				class="fade-in mb-8 rounded-xl border border-(--accent)/20 bg-(--accent-soft) px-4 py-3 text-sm text-(--accent)"
			>
				{errorMessage}
			</div>
		{/if}

		<!-- Transcript Output -->
		{#if hasTranscript || isTranscribing}
			<section class="fade-in">
				<div class="squiggle mb-6"></div>

				<div class="mb-4 flex items-center justify-between">
					<h2
						class="whimsy-text text-2xl text-(--ink)"
						style="font-family: 'Caveat', cursive; font-weight: 600;"
					>
						Transcript
					</h2>

					{#if hasTranscript}
						<div class="flex gap-2">
							<button
								type="button"
								class="rounded-lg bg-white/70 px-3 py-1.5 text-xs font-medium text-(--ink-soft) transition hover:bg-white"
								onclick={copyTranscript}
							>
								{copied ? '✓ copied' : 'copy'}
							</button>
							<button
								type="button"
								class="rounded-lg bg-white/70 px-3 py-1.5 text-xs font-medium text-(--ink-soft) transition hover:bg-white"
								onclick={downloadTranscript}
							>
								download .txt
							</button>
						</div>
					{/if}
				</div>

				{#if runSummary}
					<div class="mb-5 flex flex-wrap gap-3 text-xs text-(--muted)">
						<span>{runSummary.wordCount} words</span>
						<span>·</span>
						<span>{runSummary.blockCount} {runSummary.blockCount === 1 ? 'block' : 'blocks'}</span>
						<span>·</span>
						<span>{formatDuration(runSummary.elapsedSeconds)}</span>
					</div>
				{/if}

				{#if transcriptBlocks.length > 0}
					<div class="space-y-4">
						{#each transcriptBlocks as block (block.id)}
							<div class="fade-in border-l-2 border-(--accent)/20 py-1 pl-4">
								<p class="text-[0.95rem] leading-7 text-(--ink)">{block.text}</p>
							</div>
						{/each}
					</div>
				{:else if isTranscribing}
					<div class="space-y-3 py-4">
						<div class="h-3 w-4/5 rounded-full bg-black/4"></div>
						<div class="h-3 w-3/5 rounded-full bg-black/4"></div>
						<div class="h-3 w-2/3 rounded-full bg-black/4"></div>
						<p class="mt-4 text-sm text-(--muted)">listening…</p>
					</div>
				{/if}
			</section>
		{/if}
	</main>

	<!-- Drag overlay -->
	{#if isDragActive}
		<div
			class="pointer-events-none fixed inset-0 z-30 flex items-center justify-center bg-[rgba(250,246,240,0.88)] backdrop-blur-sm"
		>
			<div
				class="rounded-2xl border-2 border-dashed border-(--accent) bg-white/80 px-10 py-8 text-center"
			>
				<p class="whimsy-text text-3xl text-(--ink)" style="font-family: 'Caveat', cursive;">
					drop it like it's hot
				</p>
			</div>
		</div>
	{/if}

	<input
		bind:this={fileInput}
		type="file"
		accept="audio/*"
		class="hidden"
		onchange={handleInputChange}
	/>
</div>
