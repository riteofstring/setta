import { StartTranscriptionSessionResponse } from "utils/generatedTypes";

export type DictationPcmPayload = {
  audioPcm16: Int16Array;
  sampleRateHz: number;
  channels: number;
};

const REALTIME_TRANSCRIPTION_SAMPLE_RATE_HZ = 24_000;

function float32ToInt16(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let index = 0; index < input.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, input[index] ?? 0));
    output[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return output;
}

export function resampleMonoPcm16ToSampleRate(
  input: Int16Array,
  sourceSampleRateHz: number,
  targetSampleRateHz: number,
): Int16Array {
  if (sourceSampleRateHz <= 0 || targetSampleRateHz <= 0) {
    throw new Error("Provider transcription requires a positive sample rate.");
  }
  if (
    !Number.isFinite(sourceSampleRateHz) ||
    !Number.isFinite(targetSampleRateHz)
  ) {
    throw new Error("Provider transcription requires a finite sample rate.");
  }
  if (input.length === 0 || sourceSampleRateHz === targetSampleRateHz) {
    return input;
  }
  const outputLength = Math.max(
    1,
    Math.round((input.length * targetSampleRateHz) / sourceSampleRateHz),
  );
  const output = new Int16Array(outputLength);
  for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
    const sourcePosition =
      (outputIndex * sourceSampleRateHz) / targetSampleRateHz;
    const sourceIndex = Math.floor(sourcePosition);
    const nextSourceIndex = Math.min(sourceIndex + 1, input.length - 1);
    const lerpWeight = sourcePosition - sourceIndex;
    const leftSample = input[sourceIndex] ?? 0;
    const rightSample = input[nextSourceIndex] ?? leftSample;
    const interpolatedSample =
      leftSample * (1 - lerpWeight) + rightSample * lerpWeight;
    const clamped = Math.max(
      -0x8000,
      Math.min(0x7fff, Math.round(interpolatedSample)),
    );
    output[outputIndex] = clamped;
  }
  return output;
}

export function resolveProviderTranscriptionPcmPayloadForSession(
  pcmPayload: DictationPcmPayload,
  session: StartTranscriptionSessionResponse,
): DictationPcmPayload {
  if (session.resolvedTransportMode !== "realtime") {
    return pcmPayload;
  }
  if (pcmPayload.channels !== 1) {
    throw new Error("Realtime transcription requires mono PCM16 audio.");
  }
  if (
    pcmPayload.sampleRateHz <= 0 ||
    !Number.isFinite(pcmPayload.sampleRateHz)
  ) {
    throw new Error("Realtime transcription requires a valid sample rate.");
  }
  if (pcmPayload.sampleRateHz === REALTIME_TRANSCRIPTION_SAMPLE_RATE_HZ) {
    return pcmPayload;
  }
  return {
    audioPcm16: resampleMonoPcm16ToSampleRate(
      pcmPayload.audioPcm16,
      pcmPayload.sampleRateHz,
      REALTIME_TRANSCRIPTION_SAMPLE_RATE_HZ,
    ),
    sampleRateHz: REALTIME_TRANSCRIPTION_SAMPLE_RATE_HZ,
    channels: 1,
  };
}

export async function decodeDictationBlobToPcm16(
  audioBlob: Blob,
): Promise<DictationPcmPayload | null> {
  if (typeof window === "undefined") {
    return null;
  }
  const withWebkitAudioContext = window as typeof window & {
    webkitAudioContext?: typeof AudioContext;
  };
  const AudioContextCtor =
    window.AudioContext ?? withWebkitAudioContext.webkitAudioContext;
  if (!AudioContextCtor) {
    return null;
  }
  const audioContext = new AudioContextCtor();
  try {
    const audioBuffer = await audioBlob.arrayBuffer();
    const decodedBuffer = await audioContext.decodeAudioData(
      audioBuffer.slice(0),
    );
    const channelCount = Math.max(decodedBuffer.numberOfChannels, 1);
    const sampleCount = decodedBuffer.length;
    const mono = new Float32Array(sampleCount);
    for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
      const channelData = decodedBuffer.getChannelData(channelIndex);
      for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
        mono[sampleIndex] += (channelData[sampleIndex] ?? 0) / channelCount;
      }
    }
    return {
      audioPcm16: float32ToInt16(mono),
      sampleRateHz: decodedBuffer.sampleRate,
      channels: 1,
    };
  } catch {
    return null;
  } finally {
    void audioContext.close();
  }
}
