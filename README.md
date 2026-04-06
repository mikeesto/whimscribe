# Whimscribe

A browser based audio transcription app. Drop in an audio file and get a transcript — all processing runs locally in the browser via WebGPU using the [Cohere Transcribe](https://huggingface.co/onnx-community/cohere-transcribe-03-2026-ONNX) model.

## Getting started

```sh
npm install
npm run dev
```

## Requirements

A browser with WebGPU support. The model (~2 GB) is downloaded on first use and cached by the browser.
