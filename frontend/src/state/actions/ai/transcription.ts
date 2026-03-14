import { addTemporaryNotification } from "state/actions/notifications";
import { C } from "utils/c";
import { getErrorCode, getErrorDetail, res200 } from "utils/endpointUtils";
import {
  route_append_transcription_audio,
  route_cancel_transcription_session,
  route_start_transcription_session,
  route_stop_transcription_session,
} from "utils/generatedEndpoints";
import {
  SettaNotificationTypeEnum,
  StartTranscriptionSessionResponse,
  TranscriptionSessionDeltaResponse,
} from "utils/generatedTypes";
import { ProviderTranscriptionError } from "utils/transcriptionErrors";

type DictationPcmPayload = {
  audioPcm16: Int16Array;
  sampleRateHz: number;
  channels: number;
};

export type ProviderDictationTranscriptionResult =
  | {
      kind: "ok";
      transcript: string;
    }
  | {
      kind: "no_speech";
    };

const PCM16_BYTES_PER_SAMPLE = 2;
const REALTIME_TRANSCRIPTION_SAMPLE_RATE_HZ = 24_000;
const TRANSCRIPTION_APPEND_MAX_BYTES =
  C.REALTIME_BINARY_MAX_BYTES > 0
    ? C.REALTIME_BINARY_MAX_BYTES
    : 10 * 1024 * 1024;

type TranscriptionRequestOptions = {
  suppressNotification?: boolean;
  throwOnError?: boolean;
};

function encodeArrayBufferBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes.length === 0) {
    return "";
  }
  const chunkSize = 0x8000;
  const binaryChunks: string[] = [];
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binaryChunks.push(String.fromCharCode(...chunk));
  }
  return btoa(binaryChunks.join(""));
}

function handleTranscriptionEndpointError(
  responseData: unknown,
  responseStatus: number | undefined,
  options: TranscriptionRequestOptions,
): null {
  const detail =
    getErrorDetail(responseData) ?? "Provider transcription failed.";
  const errorCode = getErrorCode(responseData);
  const error = new ProviderTranscriptionError({
    message: detail,
    code: errorCode,
    status: responseStatus,
  });
  if (!options.suppressNotification) {
    addTemporaryNotification(detail, SettaNotificationTypeEnum.warning);
  }
  if (options.throwOnError) {
    throw error;
  }
  return null;
}

function float32ToInt16(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let index = 0; index < input.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, input[index] ?? 0));
    output[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return output;
}

function resolveProviderTranscriptionPcmPayloadForSession(
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

async function decodeDictationBlobToPcm16(
  audioBlob: Blob,
): Promise<DictationPcmPayload | null> {
  if (typeof window === "undefined") {
    return null;
  }
  const withWebkitAudioContext = window as typeof window & {
    webkitAudioContext?: typeof AudioContext;
  };
  const audioContextCtor =
    window.AudioContext ?? withWebkitAudioContext.webkitAudioContext;
  if (!audioContextCtor) {
    return null;
  }
  const audioContext = new audioContextCtor();
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
    const pcm16 = float32ToInt16(mono);
    return {
      audioPcm16: pcm16,
      sampleRateHz: decodedBuffer.sampleRate,
      channels: 1,
    };
  } catch {
    return null;
  } finally {
    void audioContext.close();
  }
}

function asProviderDictationTranscriptionError(
  error: unknown,
  fallbackMessage: string,
): ProviderTranscriptionError {
  if (error instanceof ProviderTranscriptionError) {
    return error;
  }
  const message =
    error instanceof Error && error.message.trim()
      ? error.message
      : fallbackMessage;
  return new ProviderTranscriptionError({
    message,
    code: "provider_failure",
    status: undefined,
  });
}

export async function startTranscriptionSession(
  transcriptionProfileId: string,
  language: string | null = null,
  options: TranscriptionRequestOptions = {},
): Promise<StartTranscriptionSessionResponse | null> {
  if (!transcriptionProfileId) {
    return null;
  }
  const res = await route_start_transcription_session({
    transcriptionProfileId,
    language,
  });
  if (!res200(res)) {
    return handleTranscriptionEndpointError(res.data, res.status, options);
  }
  return res.data;
}

export async function appendTranscriptionAudio(
  sessionId: string,
  audioPcm16: ArrayBuffer,
  sampleRateHz: number,
  channels: number,
  options: TranscriptionRequestOptions = {},
): Promise<TranscriptionSessionDeltaResponse | null> {
  if (!sessionId || audioPcm16.byteLength === 0) {
    return null;
  }
  const res = await route_append_transcription_audio({
    sessionId,
    audioPcm16Base64: encodeArrayBufferBase64(audioPcm16),
    sampleRateHz,
    channels,
  });
  if (!res200(res)) {
    return handleTranscriptionEndpointError(res.data, res.status, options);
  }
  return res.data;
}

export async function stopTranscriptionSession(
  sessionId: string,
  options: TranscriptionRequestOptions = {},
): Promise<TranscriptionSessionDeltaResponse | null> {
  if (!sessionId) {
    return null;
  }
  const res = await route_stop_transcription_session({ sessionId });
  if (!res200(res)) {
    return handleTranscriptionEndpointError(res.data, res.status, options);
  }
  return res.data;
}

export async function cancelTranscriptionSession(
  sessionId: string,
): Promise<boolean> {
  if (!sessionId) {
    return true;
  }
  const res = await route_cancel_transcription_session({ sessionId });
  return res200(res);
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

export function resolveProviderTranscriptionChunkSampleCount({
  session,
  sampleRateHz,
  channels,
}: {
  session: StartTranscriptionSessionResponse;
  sampleRateHz: number;
  channels: number;
}): number {
  if (sampleRateHz <= 0 || channels <= 0) {
    return 0;
  }
  const maxSamplesByPayload = Math.floor(
    TRANSCRIPTION_APPEND_MAX_BYTES / (PCM16_BYTES_PER_SAMPLE * channels),
  );
  if (maxSamplesByPayload <= 0) {
    return 0;
  }
  if (session.resolvedTransportMode !== "realtime") {
    return maxSamplesByPayload;
  }
  const chunkMs = session.chunkMs > 0 ? session.chunkMs : 200;
  const chunkSamplesByDuration = Math.floor((sampleRateHz * chunkMs) / 1000);
  if (chunkSamplesByDuration <= 0) {
    return 1;
  }
  return Math.min(chunkSamplesByDuration, maxSamplesByPayload);
}

export async function transcribeChatAudioWithProfile(
  transcriptionProfileId: string,
  audioBlob: Blob,
): Promise<ProviderDictationTranscriptionResult> {
  if (!transcriptionProfileId) {
    throw new ProviderTranscriptionError({
      message: "Provider dictation profile is not configured.",
      code: "profile_not_found",
      status: undefined,
    });
  }
  if (audioBlob.size === 0) {
    return { kind: "no_speech" };
  }
  const pcmPayload = await decodeDictationBlobToPcm16(audioBlob);
  if (!pcmPayload) {
    throw new ProviderTranscriptionError({
      message: "Provider dictation is not available in this browser.",
      code: "provider_failure",
      status: undefined,
    });
  }
  const session = await startTranscriptionSession(
    transcriptionProfileId,
    null,
    {
      suppressNotification: true,
      throwOnError: true,
    },
  );
  if (!session) {
    throw new ProviderTranscriptionError({
      message: "Provider transcription session could not be started.",
      code: "provider_failure",
      status: undefined,
    });
  }
  const sessionId = session.sessionId;
  const sessionPcmPayload = resolveProviderTranscriptionPcmPayloadForSession(
    pcmPayload,
    session,
  );
  const chunkSampleCount = resolveProviderTranscriptionChunkSampleCount({
    session,
    sampleRateHz: sessionPcmPayload.sampleRateHz,
    channels: sessionPcmPayload.channels,
  });
  if (chunkSampleCount <= 0) {
    await cancelTranscriptionSession(sessionId);
    throw new ProviderTranscriptionError({
      message: "Provider transcription chunk size is invalid.",
      code: "provider_failure",
      status: undefined,
    });
  }
  if (sessionPcmPayload.audioPcm16.length === 0) {
    await cancelTranscriptionSession(sessionId);
    return { kind: "no_speech" };
  }
  const appendTextSegments: string[] = [];
  try {
    for (
      let offset = 0;
      offset < sessionPcmPayload.audioPcm16.length;
      offset += chunkSampleCount
    ) {
      const nextOffset = Math.min(
        offset + chunkSampleCount,
        sessionPcmPayload.audioPcm16.length,
      );
      const chunk = sessionPcmPayload.audioPcm16.slice(offset, nextOffset);
      const appendDelta = await appendTranscriptionAudio(
        sessionId,
        chunk.buffer,
        sessionPcmPayload.sampleRateHz,
        sessionPcmPayload.channels,
        {
          suppressNotification: true,
          throwOnError: true,
        },
      );
      if (!appendDelta) {
        await cancelTranscriptionSession(sessionId);
        throw new ProviderTranscriptionError({
          message: "Provider transcription append returned no result.",
          code: "provider_failure",
          status: undefined,
        });
      }
      appendTextSegments.push(appendDelta.appendText);
    }
  } catch (error) {
    await cancelTranscriptionSession(sessionId);
    throw asProviderDictationTranscriptionError(
      error,
      "Provider transcription append failed.",
    );
  }
  let stopDelta: TranscriptionSessionDeltaResponse | null = null;
  try {
    stopDelta = await stopTranscriptionSession(sessionId, {
      suppressNotification: true,
      throwOnError: true,
    });
  } catch (error) {
    await cancelTranscriptionSession(sessionId);
    throw asProviderDictationTranscriptionError(
      error,
      "Provider transcription stop failed.",
    );
  }
  if (!stopDelta) {
    await cancelTranscriptionSession(sessionId);
    throw new ProviderTranscriptionError({
      message: "Provider transcription stop returned no result.",
      code: "provider_failure",
      status: undefined,
    });
  }
  const fullText = stopDelta.fullText.trim();
  if (fullText) {
    return { kind: "ok", transcript: fullText };
  }
  const appendText =
    `${appendTextSegments.join("")}${stopDelta.appendText}`.trim();
  if (appendText) {
    return { kind: "ok", transcript: appendText };
  }
  return { kind: "no_speech" };
}
