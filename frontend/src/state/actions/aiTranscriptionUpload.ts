import { ProviderTranscriptionError } from "utils/transcriptionErrors";
import {
  decodeDictationBlobToPcm16,
  DictationPcmPayload,
  resolveProviderTranscriptionPcmPayloadForSession,
} from "./aiTranscriptionAudio";
import {
  appendTranscriptionAudio,
  cancelTranscriptionSession,
  resolveProviderTranscriptionChunkSampleCount,
  startTranscriptionSession,
  stopTranscriptionSession,
} from "./aiTranscriptionSessions";

export type ProviderDictationTranscriptionResult =
  | {
      kind: "ok";
      transcript: string;
    }
  | {
      kind: "no_speech";
    };

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

async function appendPreparedTranscriptionAudio(
  sessionId: string,
  pcmPayload: DictationPcmPayload,
  chunkSampleCount: number,
): Promise<Array<string>> {
  const appendTextSegments: string[] = [];
  for (
    let offset = 0;
    offset < pcmPayload.audioPcm16.length;
    offset += chunkSampleCount
  ) {
    const nextOffset = Math.min(
      offset + chunkSampleCount,
      pcmPayload.audioPcm16.length,
    );
    const chunk = pcmPayload.audioPcm16.slice(offset, nextOffset);
    const appendDelta = await appendTranscriptionAudio(
      sessionId,
      chunk.buffer,
      pcmPayload.sampleRateHz,
      pcmPayload.channels,
      {
        suppressNotification: true,
        throwOnError: true,
      },
    );
    if (!appendDelta) {
      throw new ProviderTranscriptionError({
        message: "Provider transcription append returned no result.",
        code: "provider_failure",
        status: undefined,
      });
    }
    appendTextSegments.push(appendDelta.appendText);
  }
  return appendTextSegments;
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

  let appendTextSegments: string[] = [];
  try {
    appendTextSegments = await appendPreparedTranscriptionAudio(
      sessionId,
      sessionPcmPayload,
      chunkSampleCount,
    );
  } catch (error) {
    await cancelTranscriptionSession(sessionId);
    throw asProviderDictationTranscriptionError(
      error,
      "Provider transcription append failed.",
    );
  }

  let stopDelta = null;
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
