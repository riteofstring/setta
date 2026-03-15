import {
  type MutableRefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { addTemporaryNotification } from "state/actions/notifications";
import {
  type DictationState,
  type SpeechRecognitionLike,
  getSpeechRecognitionConstructor,
  insertTextAtSelection,
  isDictationAvailable,
  isNoSpeechDictationError,
  mapDictationError,
  pickProviderRecorderMimeType,
} from "./dictation";
import {
  type DictationProviderFailureClass,
  type DictationProviderFailurePhase,
  classifyProviderDictationFailureClass,
  shouldFallbackToBrowserAfterProviderFailure,
} from "./dictationPolicy";

export type ProviderDictationTranscriptionResult =
  | {
      kind: "ok";
      transcript: string;
    }
  | {
      kind: "no_speech";
    };

type UseChatInputDictationArgs = {
  disabled: boolean;
  dictationMode: "auto" | "browser" | "provider";
  onProviderDictationTranscribe?: (
    audioBlob: Blob,
  ) => Promise<ProviderDictationTranscriptionResult>;
  dictationEnabledByProvider: boolean;
  providerDictationLikelySupported: boolean;
  textareaRef: MutableRefObject<HTMLTextAreaElement | null>;
  inputValueRef: MutableRefObject<string>;
  setInputValue: (nextValue: string) => void;
};

export function useChatInputDictation({
  disabled,
  dictationMode,
  onProviderDictationTranscribe,
  dictationEnabledByProvider,
  providerDictationLikelySupported,
  textareaRef,
  inputValueRef,
  setInputValue,
}: UseChatInputDictationArgs) {
  const [dictationState, setDictationState] = useState<DictationState>("idle");
  const [dictationFeedback, setDictationFeedback] = useState<string | null>(
    null,
  );
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const providerRecorderRef = useRef<MediaRecorder | null>(null);
  const providerStreamRef = useRef<MediaStream | null>(null);
  const providerChunksRef = useRef<Array<BlobPart>>([]);
  const dictationSourceRef = useRef<"browser" | "provider" | null>(null);

  const dictationSupported = Boolean(getSpeechRecognitionConstructor());
  const canBrowserDictate = isDictationAvailable(dictationSupported);
  const mediaRecorderSupported =
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined" &&
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia);
  const canProviderDictate = Boolean(
    dictationEnabledByProvider &&
      onProviderDictationTranscribe &&
      mediaRecorderSupported,
  );
  const canAutoUseProviderDictation =
    canProviderDictate && providerDictationLikelySupported;
  const canDictate =
    !disabled &&
    (() => {
      if (dictationMode === "provider") {
        return canProviderDictate;
      }
      if (dictationMode === "browser") {
        return canBrowserDictate;
      }
      return canAutoUseProviderDictation || canBrowserDictate;
    })();

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
    [inputValueRef, setInputValue, textareaRef],
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
      if (!canProviderDictate || !onProviderDictationTranscribe) {
        if (
          maybeFallbackForProviderFailure({
            phase: "capture_start",
            failureClass: "unknown",
            allowBrowserFallback,
          })
        ) {
          return;
        }
        setDictationState("error");
        setDictationFeedback("Provider dictation is not available.");
        return;
      }
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      ) {
        if (
          maybeFallbackForProviderFailure({
            phase: "capture_start",
            failureClass: "unknown",
            allowBrowserFallback,
          })
        ) {
          return;
        }
        setDictationState("error");
        setDictationFeedback("Provider dictation is not available.");
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
          if (
            maybeFallbackForProviderFailure({
              phase: "capture_start",
              failureClass: "unknown",
              allowBrowserFallback,
            })
          ) {
            return;
          }
          setDictationState("error");
          setDictationFeedback("Provider dictation is not available.");
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
          cleanupProviderCapture();
          if (
            maybeFallbackForProviderFailure({
              phase: "capture_runtime",
              failureClass: "unknown",
              allowBrowserFallback,
            })
          ) {
            return;
          }
          setDictationState("error");
          setDictationFeedback("Microphone input failed.");
        };
        recorder.onstop = () => {
          providerRecorderRef.current = null;
          dictationSourceRef.current = null;
          const streamRef = providerStreamRef.current;
          if (streamRef) {
            for (const track of streamRef.getTracks()) {
              track.stop();
            }
          }
          providerStreamRef.current = null;
          const chunks = providerChunksRef.current;
          providerChunksRef.current = [];
          let blobType = recorder.mimeType || mimeType || "audio/webm";
          for (const chunk of chunks) {
            if (chunk instanceof Blob && chunk.type) {
              blobType = chunk.type;
              break;
            }
          }
          const blob = new Blob(chunks, { type: blobType });
          if (blob.size === 0) {
            setDictationState("idle");
            setDictationFeedback(null);
            addTemporaryNotification("No speech was detected.");
            return;
          }
          setDictationState("transcribing");
          setDictationFeedback("Transcribing...");
          void (async () => {
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
                throw new Error(
                  "Provider transcription returned an empty result.",
                );
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
          })();
        };
        setDictationState("listening");
        setDictationFeedback("Listening...");
        recorder.start();
      } catch {
        cleanupProviderCapture();
        if (
          maybeFallbackForProviderFailure({
            phase: "capture_start",
            failureClass: "unknown",
            allowBrowserFallback,
          })
        ) {
          return;
        }
        setDictationState("error");
        setDictationFeedback("Microphone access was denied.");
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
    canAutoUseProviderDictation,
    canDictate,
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
    if (!disabled || dictationState !== "listening") {
      return;
    }
    stopActiveDictationImmediately();
  }, [dictationState, disabled, stopActiveDictationImmediately]);

  const handleDictationToggle = useCallback(() => {
    if (disabled) {
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
    disabled,
    startDictation,
    stopBrowserDictation,
    stopProviderCapture,
  ]);

  const dictationAriaLabel = useMemo(() => {
    if (dictationState === "listening") {
      return "Stop Mic";
    }
    if (dictationState === "transcribing") {
      return "Transcribing";
    }
    return "Mic";
  }, [dictationState]);

  return {
    canDictate,
    dictationAriaLabel,
    dictationFeedback,
    dictationState,
    handleDictationToggle,
  };
}
