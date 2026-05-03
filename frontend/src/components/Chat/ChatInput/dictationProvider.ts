import { type MutableRefObject } from "react";
import { addTemporaryNotification } from "state/actions/notifications";
import { type DictationState } from "../dictation";
import {
  type DictationProviderFailureClass,
  type DictationProviderFailurePhase,
  classifyProviderDictationFailureClass,
} from "../dictationPolicy";

import { type ProviderDictationTranscriptionResult } from "./shared";

export function handleProviderDictationUnavailable(args: {
  allowBrowserFallback: boolean;
  failureClass: DictationProviderFailureClass;
  message: string;
  maybeFallbackForProviderFailure: (args: {
    phase: DictationProviderFailurePhase;
    failureClass: DictationProviderFailureClass;
    allowBrowserFallback: boolean;
  }) => boolean;
  phase: DictationProviderFailurePhase;
  setDictationFeedback: (value: string | null) => void;
  setDictationState: (value: DictationState) => void;
}): boolean {
  const {
    allowBrowserFallback,
    failureClass,
    maybeFallbackForProviderFailure,
    message,
    phase,
    setDictationFeedback,
    setDictationState,
  } = args;
  if (
    maybeFallbackForProviderFailure({
      phase,
      failureClass,
      allowBrowserFallback,
    })
  ) {
    return true;
  }
  setDictationState("error");
  setDictationFeedback(message);
  return true;
}

export function canStartProviderDictation(args: {
  allowBrowserFallback: boolean;
  canProviderDictate: boolean;
  maybeFallbackForProviderFailure: (args: {
    phase: DictationProviderFailurePhase;
    failureClass: DictationProviderFailureClass;
    allowBrowserFallback: boolean;
  }) => boolean;
  onProviderDictationTranscribe?:
    | ((audioBlob: Blob) => Promise<ProviderDictationTranscriptionResult>)
    | undefined;
  setDictationFeedback: (value: string | null) => void;
  setDictationState: (value: DictationState) => void;
}): boolean {
  const {
    allowBrowserFallback,
    canProviderDictate,
    maybeFallbackForProviderFailure,
    onProviderDictationTranscribe,
    setDictationFeedback,
    setDictationState,
  } = args;
  if (!canProviderDictate || !onProviderDictationTranscribe) {
    handleProviderDictationUnavailable({
      allowBrowserFallback,
      failureClass: "unknown",
      maybeFallbackForProviderFailure,
      message: "Provider dictation is not available.",
      phase: "capture_start",
      setDictationFeedback,
      setDictationState,
    });
    return false;
  }
  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices?.getUserMedia ||
    typeof MediaRecorder === "undefined"
  ) {
    handleProviderDictationUnavailable({
      allowBrowserFallback,
      failureClass: "unknown",
      maybeFallbackForProviderFailure,
      message: "Provider dictation is not available.",
      phase: "capture_start",
      setDictationFeedback,
      setDictationState,
    });
    return false;
  }
  return true;
}

export function stopProviderStreamTracks(stream: MediaStream | null): void {
  if (!stream) {
    return;
  }
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

export function resolveProviderRecordingBlob(args: {
  chunks: BlobPart[];
  fallbackMimeType: string;
  recorder: MediaRecorder;
}): Blob {
  const { chunks, fallbackMimeType, recorder } = args;
  let blobType = recorder.mimeType || fallbackMimeType || "audio/webm";
  for (const chunk of chunks) {
    if (chunk instanceof Blob && chunk.type) {
      blobType = chunk.type;
      break;
    }
  }
  return new Blob(chunks, { type: blobType });
}

export async function transcribeProviderRecording(args: {
  allowBrowserFallback: boolean;
  blob: Blob;
  insertTranscript: (transcript: string) => void;
  maybeFallbackForProviderFailure: (args: {
    phase: DictationProviderFailurePhase;
    failureClass: DictationProviderFailureClass;
    allowBrowserFallback: boolean;
  }) => boolean;
  onProviderDictationTranscribe: (
    audioBlob: Blob,
  ) => Promise<ProviderDictationTranscriptionResult>;
  setDictationFeedback: (value: string | null) => void;
  setDictationState: (value: DictationState) => void;
}): Promise<void> {
  const {
    allowBrowserFallback,
    blob,
    insertTranscript,
    maybeFallbackForProviderFailure,
    onProviderDictationTranscribe,
    setDictationFeedback,
    setDictationState,
  } = args;
  try {
    const result = await onProviderDictationTranscribe(blob);
    if (result.kind === "no_speech") {
      setDictationState("idle");
      setDictationFeedback(null);
      addTemporaryNotification("No speech was detected.");
      return;
    }
    const normalized = result.transcript.trim();
    if (!normalized) {
      throw new Error("Provider transcription returned an empty result.");
    }
    insertTranscript(`${normalized} `);
    setDictationState("idle");
    setDictationFeedback(null);
  } catch (error) {
    const failureClass = classifyProviderDictationFailureClass(error);
    if (
      maybeFallbackForProviderFailure({
        phase: "transcription",
        failureClass,
        allowBrowserFallback,
      })
    ) {
      return;
    }
    setDictationState("error");
    setDictationFeedback(
      error instanceof Error && error.message
        ? error.message
        : "Provider transcription failed.",
    );
  }
}

export function handleProviderRecorderError(args: {
  allowBrowserFallback: boolean;
  cleanupProviderCapture: () => void;
  maybeFallbackForProviderFailure: (args: {
    phase: DictationProviderFailurePhase;
    failureClass: DictationProviderFailureClass;
    allowBrowserFallback: boolean;
  }) => boolean;
  setDictationFeedback: (value: string | null) => void;
  setDictationState: (value: DictationState) => void;
}): void {
  const {
    allowBrowserFallback,
    cleanupProviderCapture,
    maybeFallbackForProviderFailure,
    setDictationFeedback,
    setDictationState,
  } = args;
  cleanupProviderCapture();
  handleProviderDictationUnavailable({
    allowBrowserFallback,
    failureClass: "unknown",
    maybeFallbackForProviderFailure,
    message: "Microphone input failed.",
    phase: "capture_runtime",
    setDictationFeedback,
    setDictationState,
  });
}

export function handleProviderRecorderStop(args: {
  allowBrowserFallback: boolean;
  fallbackMimeType: string;
  dictationSourceRef: MutableRefObject<"browser" | "provider" | null>;
  insertTranscript: (transcript: string) => void;
  maybeFallbackForProviderFailure: (args: {
    phase: DictationProviderFailurePhase;
    failureClass: DictationProviderFailureClass;
    allowBrowserFallback: boolean;
  }) => boolean;
  onProviderDictationTranscribe: (
    audioBlob: Blob,
  ) => Promise<ProviderDictationTranscriptionResult>;
  providerChunksRef: MutableRefObject<Array<BlobPart>>;
  providerRecorderRef: MutableRefObject<MediaRecorder | null>;
  providerStreamRef: MutableRefObject<MediaStream | null>;
  recorder: MediaRecorder;
  setDictationFeedback: (value: string | null) => void;
  setDictationState: (value: DictationState) => void;
}): void {
  const {
    allowBrowserFallback,
    fallbackMimeType,
    dictationSourceRef,
    insertTranscript,
    maybeFallbackForProviderFailure,
    onProviderDictationTranscribe,
    providerChunksRef,
    providerRecorderRef,
    providerStreamRef,
    recorder,
    setDictationFeedback,
    setDictationState,
  } = args;
  providerRecorderRef.current = null;
  dictationSourceRef.current = null;
  stopProviderStreamTracks(providerStreamRef.current);
  providerStreamRef.current = null;
  const chunks = providerChunksRef.current;
  providerChunksRef.current = [];
  const blob = resolveProviderRecordingBlob({
    chunks,
    fallbackMimeType,
    recorder,
  });
  if (blob.size === 0) {
    setDictationState("idle");
    setDictationFeedback(null);
    addTemporaryNotification("No speech was detected.");
    return;
  }
  setDictationState("transcribing");
  setDictationFeedback("Transcribing...");
  void transcribeProviderRecording({
    allowBrowserFallback,
    blob,
    insertTranscript,
    maybeFallbackForProviderFailure,
    onProviderDictationTranscribe,
    setDictationFeedback,
    setDictationState,
  });
}
