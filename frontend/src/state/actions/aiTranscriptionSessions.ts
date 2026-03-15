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

type TranscriptionRequestOptions = {
  suppressNotification?: boolean;
  throwOnError?: boolean;
};

const PCM16_BYTES_PER_SAMPLE = 2;
const TRANSCRIPTION_APPEND_MAX_BYTES =
  C.REALTIME_BINARY_MAX_BYTES > 0
    ? C.REALTIME_BINARY_MAX_BYTES
    : 10 * 1024 * 1024;

function encodeArrayBufferBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes.length === 0) {
    return "";
  }
  const CHUNK_SIZE = 0x8000;
  const binaryChunks: string[] = [];
  for (let index = 0; index < bytes.length; index += CHUNK_SIZE) {
    const chunk = bytes.subarray(index, index + CHUNK_SIZE);
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
