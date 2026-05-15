<script lang="ts">
	import { resolve } from '$app/paths';

	type Faq = {
		question: string;
		answer: string;
	};

	type FaqGroup = {
		title: string;
		items: Faq[];
	};

	const groups: FaqGroup[] = [
		{
			title: 'Privacy & your data',
			items: [
				{
					question: 'Does my audio leave my computer?',
					answer: 'No. Your audio file is read and transcribed entirely inside your browser tab.'
				},
				{
					question: 'Is my audio used to train an AI model?',
					answer:
						"No. The transcription model runs locally on your machine. It doesn't learn from anything you give it, and nothing you transcribe is sent anywhere for training."
				},
				{
					question: 'Do you store or log my transcripts?',
					answer:
						'No. Your transcript only exists in your browser tab and it disappears when you close it unless you copy it or download the .txt file.'
				},
				{
					question: 'Are there any analytics, trackers, or telemetry?',
					answer:
						"No. This site doesn't include any analytics, trackers or telemetry. Nobody can see what you're transcribing."
				},
				{
					question: 'How can I be sure of all this?',
					answer:
						"The whole project is open source. You can read the code on GitHub, or open your browser's developer tools and watch the Network tab while you transcribe — you won't see your audio being sent anywhere."
				}
			]
		},
		{
			title: 'Internet & offline use',
			items: [
				{
					question: 'Does it need an internet connection?',
					answer:
						'On your first visit the app downloads the AI model (about 2 GB). After that, your browser keeps a copy, and you can transcribe with no internet at all.'
				},
				{
					question: 'Where does the model come from?',
					answer:
						"It currently uses the Cohere Transcribe model, downloaded from Hugging Face (a well known host for open AI models). After it's downloaded, it lives on your computer."
				},
				{
					question: 'Where is the model stored on my computer?',
					answer:
						"In your browser's own storage for this site. If you clear your browsing data for this site, the model gets removed and will need to be downloaded again next time."
				}
			]
		},
		{
			title: 'Browser & hardware',
			items: [
				{
					question: 'Why does it need a recent browser?',
					answer:
						'Whimscribe uses WebGPU, a newer browser feature that lets the AI model run on your graphics card at a usable speed. Recent versions of Chrome, Edge, and Safari on a desktop computer all support it.'
				},
				{
					question: "Why doesn't it work well on my phone?",
					answer:
						"The model is around 2 GB and needs a fair bit of memory and graphics power to run. Most phones don't have enough of either, so a laptop or desktop is recommended."
				}
			]
		},
		{
			title: 'Using it',
			items: [
				{
					question: 'What audio formats can I use?',
					answer:
						'Most common ones: mp3, wav, m4a, ogg, flac, and webm. If your browser can play it, Whimscribe can likely transcribe it.'
				},
				{
					question: 'Is there a file size or length limit?',
					answer:
						"There's no hard limit, but very long recordings take longer and use more memory. For best results, try files under an hour or so."
				},
				{
					question: 'Is it really free?',
					answer:
						"Yes. There's no account, no payment, no usage limits. The cost of running it (the electricity and the GPU time) is paid by your own computer."
				}
			]
		}
	];
</script>

<svelte:head>
	<title>FAQ · Whimscribe</title>
	<meta
		name="description"
		content="Answers about privacy, offline use, and how Whimscribe works."
	/>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Caveat:wght@400;600;700&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div class="relative min-h-screen px-4 py-8 md:px-6 md:py-12">
	<main class="relative mx-auto max-w-2xl">
		<header class="mb-8 text-center">
			<a
				href={resolve('/')}
				class="text-xs text-(--muted) underline decoration-dotted underline-offset-2 hover:text-(--accent)"
			>
				← back to Whimscribe
			</a>
			<h1
				class="whimsy-text mt-3 text-5xl text-(--ink) md:text-6xl"
				style="font-family: 'Caveat', cursive; font-weight: 700;"
			>
				FAQ
			</h1>
		</header>

		<section
			class="fade-in mb-10 rounded-xl border border-(--border) bg-white/70 px-5 py-4 text-sm leading-6 text-(--ink-soft)"
		>
			<p>
				Whimscribe is built on the idea that <span class="font-medium text-(--ink)"
					>your audio should stay on your computer</span
				>. Everything happens inside your browser tab. Nothing is uploaded anywhere.
			</p>
		</section>

		{#each groups as group, groupIndex (group.title)}
			<section class="mb-10">
				<div class="mb-4 flex items-center gap-3">
					<span
						class="whimsy-text text-2xl text-(--accent)"
						style="font-family: 'Caveat', cursive;"
					>
						{groupIndex + 1}.
					</span>
					<h2
						class="whimsy-text text-2xl text-(--ink)"
						style="font-family: 'Caveat', cursive; font-weight: 600;"
					>
						{group.title}
					</h2>
				</div>

				<div class="space-y-3">
					{#each group.items as item (item.question)}
						<details
							class="group rounded-xl border border-(--border) bg-white/70 px-4 py-3 transition hover:bg-white/90"
						>
							<summary
								class="flex cursor-pointer list-none items-start justify-between gap-4 text-sm font-medium text-(--ink)"
							>
								<span>{item.question}</span>
								<span
									class="mt-0.5 shrink-0 text-(--muted) transition-transform group-open:rotate-45"
									aria-hidden="true">+</span
								>
							</summary>
							<p class="mt-2 text-sm leading-6 text-(--ink-soft)">{item.answer}</p>
						</details>
					{/each}
				</div>
			</section>
			{#if groupIndex < groups.length - 1}
				<div class="squiggle mb-10"></div>
			{/if}
		{/each}

		<section
			class="fade-in mt-12 rounded-xl border border-(--border) bg-white/70 px-5 py-4 text-sm leading-6 text-(--ink-soft)"
		>
			<p>
				Still wondering about something? The code is open, have a poke around on
				<a
					href="https://github.com/mikeesto/whimscribe"
					class="underline underline-offset-2 hover:text-(--accent)"
					target="_blank"
					rel="noopener noreferrer">GitHub</a
				>
				or get in touch with
				<a
					href="https://mikeesto.com"
					class="underline underline-offset-2 hover:text-(--accent)"
					target="_blank"
					rel="noopener noreferrer">me</a
				>.
			</p>
		</section>

		<footer class="mx-auto mt-12 mb-4 text-center text-xs text-(--muted)">
			<a
				href={resolve('/')}
				class="underline decoration-dotted underline-offset-2 hover:text-(--ink)"
			>
				← back to Whimscribe
			</a>
		</footer>
	</main>
</div>

<style>
	summary::-webkit-details-marker {
		display: none;
	}
</style>
