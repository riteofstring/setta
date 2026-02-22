import { useCallback } from "react";
import {
  appendTranscriptionAudio,
  cancelTranscriptionSession,
  startTranscriptionSession,
  stopTranscriptionSession,
} from "state/actions/ai";
import type {
  StartTranscriptionSessionResponse,
  TranscriptionSessionDeltaResponse,
} from "utils/generatedTypes";

export function requireTranscriptionSessionDelta(
  response: TranscriptionSessionDeltaResponse | null,
): TranscriptionSessionDeltaResponse {
  if (!response) {
    throw new Error("Provider transcription failed.");
  }
  return response;
}

function useProviderTranscriptionSessionHandlers({
  transcriptionProfileId,
  suppressStartNotification,
}: {
  transcriptionProfileId: string | null;
  suppressStartNotification: boolean;
}): {
  onProviderTranscriptionSessionStart: () => Promise<StartTranscriptionSessionResponse | null>;
  onProviderTranscriptionSessionAppend: (
    sessionId: string,
    audioPcm16: ArrayBuffer,
    sampleRateHz: number,
    channels: number,
  ) => Promise<string | null>;
  onProviderTranscriptionSessionStop: (
    sessionId: string,
  ) => Promise<string | null>;
  onProviderTranscriptionSessionCancel: (sessionId: string) => Promise<void>;
} {
  const onProviderTranscriptionSessionStart = useCallback(async () => {
    if (!transcriptionProfileId) {
      return null;
    }
    return startTranscriptionSession(transcriptionProfileId, null, {
      suppressNotification: suppressStartNotification,
    });
  }, [suppressStartNotification, transcriptionProfileId]);

  const onProviderTranscriptionSessionAppend = useCallback(
    async (
      sessionId: string,
      audioPcm16: ArrayBuffer,
      sampleRateHz: number,
      channels: number,
    ) => {
      const response = await appendTranscriptionAudio(
        sessionId,
        audioPcm16,
        sampleRateHz,
        channels,
      );
      return requireTranscriptionSessionDelta(response).appendText || null;
    },
    [],
  );

  const onProviderTranscriptionSessionStop = useCallback(
    async (sessionId: string) => {
      const response = await stopTranscriptionSession(sessionId);
      return requireTranscriptionSessionDelta(response).appendText || null;
    },
    [],
  );

  const onProviderTranscriptionSessionCancel = useCallback(
    async (sessionId: string) => {
      await cancelTranscriptionSession(sessionId);
    },
    [],
  );

  return {
    onProviderTranscriptionSessionStart,
    onProviderTranscriptionSessionAppend,
    onProviderTranscriptionSessionStop,
    onProviderTranscriptionSessionCancel,
  };
}
