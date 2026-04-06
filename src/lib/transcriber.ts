type TransformersModule = typeof import('@huggingface/transformers');
type ProgressInfo = import('@huggingface/transformers').ProgressInfo;
type AudioChunk = Float32Array | Float64Array;

type CohereTranscriber = {
	processor: {
		(audio: AudioChunk): Promise<Record<string, unknown>>;
		feature_extractor: {
			split_audio(audio: AudioChunk): AudioChunk[];
		};
		get_decoder_prompt_ids(language: string): number[];
		constructor: {
			join_chunks(texts: string[], language?: string): string;
		};
	};
	tokenizer: {
		decode(tokenIds: unknown, options: { skip_special_tokens: boolean }): string;
	};
	model: {
		generate(inputs: Record<string, unknown>): Promise<Array<{ tolist(): unknown }>>;
	};
};

export const DEFAULT_SAMPLE_RATE = 16_000;
export const COHERE_MODEL_ID = 'onnx-community/cohere-transcribe-03-2026-ONNX';

export type LoadUpdate = {
	progress: number;
	statusText: string;
	ready: boolean;
};

export type TranscriptBlock = {
	id: number;
	text: string;
};

export type TranscriptionProgress = {
	completed: number;
	total: number;
	blocks: TranscriptBlock[];
	fullText: string;
};

export type TranscriptionResult = {
	text: string;
	blocks: TranscriptBlock[];
	blockCount: number;
};

let transformersPromise: Promise<TransformersModule> | null = null;
let transcriberPromise: Promise<CohereTranscriber> | null = null;
let cachedTranscriber: CohereTranscriber | null = null;

function getTransformersModule() {
	if (!transformersPromise) {
		transformersPromise = import('@huggingface/transformers');
	}

	return transformersPromise;
}

function basename(fileName: string) {
	const segments = fileName.split('/');
	return segments.at(-1) ?? fileName;
}

function toLoadUpdate(info: ProgressInfo): LoadUpdate {
	switch (info.status) {
		case 'initiate':
			return {
				progress: 0,
				statusText: `Preparing ${basename(info.file)}…`,
				ready: false
			};

		case 'download':
			return {
				progress: 0,
				statusText: `Downloading ${basename(info.file)}…`,
				ready: false
			};

		case 'progress':
			return {
				progress: Math.round(info.progress),
				statusText: `Downloading ${basename(info.file)}… ${Math.round(info.progress)}%`,
				ready: false
			};

		case 'progress_total':
			return {
				progress: Math.round(info.progress),
				statusText: `Loading the transcription model… ${Math.round(info.progress)}%`,
				ready: false
			};

		case 'done':
			return {
				progress: 100,
				statusText: `Finalizing ${basename(info.file)}…`,
				ready: false
			};

		case 'ready':
			return {
				progress: 100,
				statusText: 'Model ready. Future runs use the browser cache.',
				ready: true
			};

		default:
			return {
				progress: 0,
				statusText: 'Preparing the transcription model…',
				ready: false
			};
	}
}

export async function ensureTranscriber(onUpdate?: (update: LoadUpdate) => void) {
	if (cachedTranscriber) {
		onUpdate?.({
			progress: 100,
			statusText: 'Model ready. Future runs use the browser cache.',
			ready: true
		});

		return cachedTranscriber;
	}

	if (!transcriberPromise) {
		transcriberPromise = (async () => {
			const { pipeline } = await getTransformersModule();

			const transcriber = (await pipeline('automatic-speech-recognition', COHERE_MODEL_ID, {
				dtype: 'q4',
				device: 'webgpu',
				progress_callback: (info) => {
					onUpdate?.(toLoadUpdate(info));
				}
			})) as unknown as CohereTranscriber;

			cachedTranscriber = transcriber;
			onUpdate?.({
				progress: 100,
				statusText: 'Model ready. Future runs use the browser cache.',
				ready: true
			});

			return transcriber;
		})().finally(() => {
			transcriberPromise = null;
		});
	}

	return transcriberPromise;
}

export async function transcribeAudio(
	audio: Float32Array,
	language: string,
	onProgress?: (update: TranscriptionProgress) => void
) {
	const transcriber = await ensureTranscriber();
	const chunks = transcriber.processor.feature_extractor.split_audio(audio);
	const decoderInputIds = transcriber.processor.get_decoder_prompt_ids(language);
	const blocks: TranscriptBlock[] = [];
	const blockTexts: string[] = [];

	for (const [index, chunk] of chunks.entries()) {
		const inputs = await transcriber.processor(chunk);
		const outputs = await transcriber.model.generate({
			...inputs,
			decoder_input_ids: decoderInputIds,
			max_new_tokens: 1024
		});

		const text = transcriber.tokenizer
			.decode(outputs[0]?.tolist(), {
				skip_special_tokens: true
			})
			.trim();

		if (text) {
			blockTexts.push(text);
			blocks.push({
				id: blocks.length + 1,
				text
			});
		}

		onProgress?.({
			completed: index + 1,
			total: chunks.length,
			blocks: [...blocks],
			fullText: transcriber.processor.constructor.join_chunks(blockTexts, language)
		});
	}

	return {
		text: transcriber.processor.constructor.join_chunks(blockTexts, language),
		blocks,
		blockCount: chunks.length
	} satisfies TranscriptionResult;
}

export async function decodeAudioFile(file: File, sampleRate = DEFAULT_SAMPLE_RATE) {
	const AudioContextClass =
		window.AudioContext ||
		(window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

	if (!AudioContextClass) {
		throw new Error('This browser cannot decode audio files.');
	}

	const audioContext = new AudioContextClass({ sampleRate });

	try {
		const arrayBuffer = await file.arrayBuffer();
		const decoded = await audioContext.decodeAudioData(arrayBuffer);

		if (decoded.numberOfChannels === 1) {
			return new Float32Array(decoded.getChannelData(0));
		}

		const mono = new Float32Array(decoded.length);
		for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
			const channelData = decoded.getChannelData(channel);
			for (let index = 0; index < decoded.length; index += 1) {
				mono[index] += channelData[index] / decoded.numberOfChannels;
			}
		}

		return mono;
	} finally {
		await audioContext.close();
	}
}

export function buildWaveformPeaks(audio: Float32Array, bars = 56) {
	if (audio.length === 0) {
		return Array.from({ length: bars }, () => 18);
	}

	const blockSize = Math.max(1, Math.floor(audio.length / bars));
	const peaks = Array.from({ length: bars }, (_, index) => {
		const start = index * blockSize;
		const end = index === bars - 1 ? audio.length : Math.min(audio.length, start + blockSize);
		let sum = 0;

		for (let cursor = start; cursor < end; cursor += 1) {
			sum += Math.abs(audio[cursor]);
		}

		return sum / Math.max(1, end - start);
	});

	const maxPeak = Math.max(...peaks, 0.0001);

	return peaks.map((peak) => Math.max(12, Math.round((peak / maxPeak) * 100)));
}
