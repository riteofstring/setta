import { type MutableRefObject, useCallback, useEffect, useRef } from "react";
import { addTemporaryNotification } from "state/actions/notifications";
import { type ChatDictationMode } from "utils/generatedTypes";
import {
  type DictationState,
  type SpeechRecognitionLike,
  getSpeechRecognitionConstructor,
  insertTextAtSelection,
  isNoSpeechDictationError,
  mapDictationError,
  pickProviderRecorderMimeType,
} from "../dictation";
import {
  type DictationProviderFailureClass,
  type DictationProviderFailurePhase,
  shouldFallbackToBrowserAfterProviderFailure,
} from "../dictationPolicy";
import {
  canStartProviderDictation,
  handleProviderDictationUnavailable,
  handleProviderRecorderError,
  handleProviderRecorderStop,
} from "./dictationProvider";
import { type ProviderDictationTranscriptionResult } from "./shared";

type UseChatInputDictationControlsInput = {
  canAutoUseProviderDictation: boolean;
  canBrowserDictate: boolean;
  canDictate: boolean;
  canProviderDictate: boolean;
  dictationMode: ChatDictationMode;
  dictationState: DictationState;
  inputValueRef: MutableRefObject<string>;
  isDisabled: boolean;
  onProviderDictationTranscribe?: (
    audioBlob: Blob,
  ) => Promise<ProviderDictationTranscriptionResult>;
  setDictationFeedback: (value: string | null) => void;
  setDictationState: (value: DictationState) => void;
  setInputValue: (nextValue: string) => void;
  textareaRef: MutableRefObject<HTMLTextAreaElement | null>;
};

export function useChatInputDictationControls({
  canAutoUseProviderDictation,
  canBrowserDictate,
  canDictate,
  canProviderDictate,
  dictationMode,
  dictationState,
  inputValueRef,
  isDisabled,
  onProviderDictationTranscribe,
  setDictationFeedback,
  setDictationState,
  setInputValue,
  textareaRef,
}: UseChatInputDictationControlsInput) {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const providerRecorderRef = useRef<MediaRecorder | null>(null);
  const providerStreamRef = useRef<MediaStream | null>(null);
  const providerChunksRef = useRef<Array<BlobPart>>([]);
  const dictationSourceRef = useRef<"browser" | "provider" | null>(null);
  const cleanupProviderCapture = useCallback(() => {
    const recorder = providerRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null;
      recorder.stop();
    }
    providerRecorderRef.current = null;
    const stream = providerStreamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }
    providerStreamRef.current = null;
    providerChunksRef.current = [];
    dictationSourceRef.current = null;
  }, []);

  const stopProviderCapture = useCallback(() => {
    const recorder = providerRecorderRef.current;
    if (!recorder) {
      return;
    }
    if (recorder.state !== "inactive") {
      recorder.stop();
    }
    providerRecorderRef.current = null;
    dictationSourceRef.current = null;
    setDictationState("transcribing");
    setDictationFeedback("Transcribing...");
  }, []);

  const stopBrowserDictation = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      return;
    }
    recognition.stop();
    recognitionRef.current = null;
    dictationSourceRef.current = null;
    setDictationState("idle");
    setDictationFeedback(null);
  }, []);

  const stopActiveDictationImmediately = useCallback(() => {
    if (dictationSourceRef.current === "provider") {
      cleanupProviderCapture();
    } else {
      stopBrowserDictation();
    }
    setDictationState("idle");
    setDictationFeedback(null);
  }, [cleanupProviderCapture, stopBrowserDictation]);

  const insertTranscript = useCallback(
    (transcript: string) => {
      const node = textareaRef.current;
      const current = inputValueRef.current;
      const start = node?.selectionStart ?? current.length;
      const end = node?.selectionEnd ?? current.length;
      const result = insertTextAtSelection(current, transcript, start, end);
      setInputValue(result.value);
      requestAnimationFrame(() => {
        if (!node) {
          return;
        }
        node.focus();
        node.setSelectionRange(result.nextCaret, result.nextCaret);
      });
    },
    [setInputValue],
  );

  const startBrowserDictation = useCallback(() => {
    if (!canBrowserDictate) {
      setDictationState("error");
      setDictationFeedback("Dictation is not available.");
      return;
    }
    const RecognitionCtor = getSpeechRecognitionConstructor();
    if (!RecognitionCtor) {
      setDictationState("error");
      setDictationFeedback("Dictation is not available.");
      return;
    }
    const recognition = new RecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      let transcript = "";
      for (
        let index = event.resultIndex;
        index < event.results.length;
        index += 1
      ) {
        const result = event.results[index];
        if (!result || !result.isFinal) {
          continue;
        }
        transcript += result[0]?.transcript ?? "";
      }
      const normalized = transcript.trim();
      if (!normalized) {
        return;
      }
      insertTranscript(`${normalized} `);
      setDictationFeedback(null);
    };
    recognition.onerror = (event) => {
      if (isNoSpeechDictationError(event.error)) {
        setDictationState("idle");
        setDictationFeedback(null);
        addTemporaryNotification("No speech was detected.");
      } else {
        setDictationState("error");
        setDictationFeedback(mapDictationError(event.error));
      }
      recognitionRef.current = null;
      dictationSourceRef.current = null;
    };
    recognition.onend = () => {
      const shouldContinueListening =
        recognitionRef.current === recognition &&
        dictationSourceRef.current === "browser";
      if (!shouldContinueListening) {
        return;
      }
      try {
        recognition.start();
        setDictationState("listening");
        setDictationFeedback("Listening...");
      } catch {
        recognitionRef.current = null;
        dictationSourceRef.current = null;
        setDictationState("error");
        setDictationFeedback(mapDictationError(undefined));
      }
    };
    recognitionRef.current = recognition;
    dictationSourceRef.current = "browser";
    setDictationState("listening");
    setDictationFeedback("Listening...");
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      dictationSourceRef.current = null;
      setDictationState("error");
      setDictationFeedback(mapDictationError(undefined));
    }
  }, [canBrowserDictate, insertTranscript]);

  const maybeFallbackToBrowserDictation = useCallback(
    (allowFallback: boolean): boolean => {
      if (!allowFallback || !canBrowserDictate) {
        return false;
      }
      startBrowserDictation();
      return true;
    },
    [canBrowserDictate, startBrowserDictation],
  );

  const maybeFallbackForProviderFailure = useCallback(
    ({
      phase,
      failureClass,
      allowBrowserFallback,
    }: {
      phase: DictationProviderFailurePhase;
      failureClass: DictationProviderFailureClass;
      allowBrowserFallback: boolean;
    }): boolean => {
      if (
        !shouldFallbackToBrowserAfterProviderFailure({
          mode: dictationMode,
          phase,
          failureClass,
        })
      ) {
        return false;
      }
      return maybeFallbackToBrowserDictation(allowBrowserFallback);
    },
    [dictationMode, maybeFallbackToBrowserDictation],
  );

  const startProviderDictation = useCallback(
    async (allowBrowserFallback: boolean) => {
      if (
        !canStartProviderDictation({
          allowBrowserFallback,
          canProviderDictate,
          maybeFallbackForProviderFailure,
          onProviderDictationTranscribe,
          setDictationFeedback,
          setDictationState,
        })
      ) {
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        providerStreamRef.current = stream;
        const mimeType = pickProviderRecorderMimeType(
          MediaRecorder.isTypeSupported?.bind(MediaRecorder),
        );
        let recorder: MediaRecorder;
        try {
          recorder = mimeType
            ? new MediaRecorder(stream, { mimeType })
            : new MediaRecorder(stream);
        } catch {
          cleanupProviderCapture();
          handleProviderDictationUnavailable({
            allowBrowserFallback,
            failureClass: "unknown",
            maybeFallbackForProviderFailure,
            message: "Provider dictation is not available.",
            phase: "capture_start",
            setDictationFeedback,
            setDictationState,
          });
          return;
        }
        providerRecorderRef.current = recorder;
        providerChunksRef.current = [];
        dictationSourceRef.current = "provider";
        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            providerChunksRef.current.push(event.data);
          }
        };
        recorder.onerror = () => {
          handleProviderRecorderError({
            allowBrowserFallback,
            cleanupProviderCapture,
            maybeFallbackForProviderFailure,
            setDictationFeedback,
            setDictationState,
          });
        };
        recorder.onstop = () => {
          handleProviderRecorderStop({
            allowBrowserFallback,
            fallbackMimeType: mimeType || "audio/webm",
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
          });
        };
        setDictationState("listening");
        setDictationFeedback("Listening...");
        recorder.start();
      } catch {
        cleanupProviderCapture();
        handleProviderDictationUnavailable({
          allowBrowserFallback,
          failureClass: "unknown",
          maybeFallbackForProviderFailure,
          message: "Microphone access was denied.",
          phase: "capture_start",
          setDictationFeedback,
          setDictationState,
        });
      }
    },
    [
      canProviderDictate,
      cleanupProviderCapture,
      insertTranscript,
      maybeFallbackForProviderFailure,
      onProviderDictationTranscribe,
    ],
  );

  const startDictation = useCallback(() => {
    if (!canDictate) {
      setDictationState("error");
      setDictationFeedback("Dictation is not available.");
      return;
    }
    if (dictationMode === "provider") {
      void startProviderDictation(false);
      return;
    }
    if (dictationMode === "browser") {
      startBrowserDictation();
      return;
    }
    if (canAutoUseProviderDictation) {
      void startProviderDictation(true);
      return;
    }
    startBrowserDictation();
  }, [
    canDictate,
    canAutoUseProviderDictation,
    dictationMode,
    startBrowserDictation,
    startProviderDictation,
  ]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      cleanupProviderCapture();
    };
  }, [cleanupProviderCapture]);

  useEffect(() => {
    if (!isDisabled || dictationState !== "listening") {
      return;
    }
    stopActiveDictationImmediately();
  }, [dictationState, isDisabled, stopActiveDictationImmediately]);

  const handleDictationToggle = useCallback(() => {
    if (isDisabled) {
      return;
    }
    if (dictationState === "listening") {
      if (dictationSourceRef.current === "provider") {
        stopProviderCapture();
        return;
      }
      stopBrowserDictation();
      return;
    }
    if (dictationState === "transcribing") {
      return;
    }
    startDictation();
  }, [
    dictationState,
    isDisabled,
    startDictation,
    stopBrowserDictation,
    stopProviderCapture,
  ]);

  return { handleDictationToggle };
}
