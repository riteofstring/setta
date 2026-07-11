import type { SpeechCapabilities } from "@generated/backend";
import { useCallback, useEffect, useRef, useState } from "react";

import { useRuntimeStore } from "../../stores/runtime-store";
import {
  browserSpeechCaptureSupport,
  SpeechCaptureController,
  speechCaptureIsActive,
  type SpeechCaptureContext,
  type SpeechCaptureFailureCode,
  type SpeechCaptureIntent,
  type SpeechCaptureState,
} from "./speech-capture-controller";

export type SpeechCaptureAvailability =
  | { type: "loading" }
  | { capabilities: SpeechCapabilities; type: "configured" }
  | { message: string; type: "not_configured" }
  | {
      capabilities: SpeechCapabilities;
      code: Extract<SpeechCaptureFailureCode, "insecure_context" | "unsupported_browser">;
      message: string;
      type: "unsupported";
    }
  | { message: string; type: "failed" };

interface UseSpeechCaptureOptions {
  onCompletedTranscript: (transcript: string, intent: SpeechCaptureIntent) => Promise<void> | void;
  workspaceId: string | null;
}

export interface EasyButtonSpeechCapture {
  active: boolean;
  availability: SpeechCaptureAvailability;
  cancel: () => void;
  commit: () => void;
  start: (intent: SpeechCaptureIntent) => void;
  state: SpeechCaptureState;
}

export function useSpeechCapture({
  onCompletedTranscript,
  workspaceId,
}: UseSpeechCaptureOptions): EasyButtonSpeechCapture {
  const runtimeId = useActiveConnectedRuntimeId();
  const completionRef = useRef(onCompletedTranscript);
  completionRef.current = onCompletedTranscript;
  const currentContextRef = useRef<SpeechCaptureContext | null>(null);
  currentContextRef.current =
    runtimeId && workspaceId
      ? {
          runtimeId,
          workspaceId,
        }
      : null;
  const [state, setState] = useState<SpeechCaptureState>({ type: "idle" });
  const [capabilitiesState, setCapabilitiesState] = useState<SpeechCaptureAvailability>({
    type: "loading",
  });
  const controllerRef = useRef<SpeechCaptureController | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = new SpeechCaptureController({
      onCompletedTranscript: (transcript, intent, captureContext) => {
        if (!sameCaptureContext(captureContext, currentContextRef.current)) {
          throw new Error(
            "The active runtime or workspace changed before the transcript could be submitted.",
          );
        }
        return completionRef.current(transcript, intent);
      },
      onStateChange: setState,
    });
  }
  const controller = controllerRef.current;

  useEffect(() => {
    controller.cancel();
  }, [controller, runtimeId, workspaceId]);

  useEffect(() => {
    return () => {
      controller.dispose();
    };
  }, [controller]);

  useEffect(() => {
    let current = true;
    setCapabilitiesState({ type: "loading" });
    if (!runtimeId) {
      return () => {
        current = false;
      };
    }
    void window.setta.speech.readCapabilities().then(
      (capabilities) => {
        if (current) {
          setCapabilitiesState(speechAvailabilityForCapabilities(capabilities));
        }
      },
      () => {
        if (current) {
          setCapabilitiesState({
            message: "Voice capabilities could not be read from the runtime.",
            type: "failed",
          });
        }
      },
    );
    return () => {
      current = false;
    };
  }, [runtimeId]);

  const start = useCallback(
    (intent: SpeechCaptureIntent) => {
      if (!runtimeId || !workspaceId || capabilitiesState.type !== "configured") {
        return;
      }
      void controller.start({
        capabilities: capabilitiesState.capabilities,
        intent,
        runtimeId,
        workspaceId,
      });
    },
    [capabilitiesState, controller, runtimeId, workspaceId],
  );

  return {
    active: speechCaptureIsActive(state),
    availability: capabilitiesState,
    cancel: controller.cancel,
    commit: controller.commit,
    start,
    state,
  };
}

export function sameCaptureContext(
  captureContext: SpeechCaptureContext,
  currentContext: SpeechCaptureContext | null,
): boolean {
  return (
    currentContext !== null &&
    captureContext.runtimeId === currentContext.runtimeId &&
    captureContext.workspaceId === currentContext.workspaceId
  );
}

export function speechAvailabilityForCapabilities(
  capabilities: SpeechCapabilities,
  support = browserSpeechCaptureSupport(),
): SpeechCaptureAvailability {
  if (!support.supported) {
    return { ...support, capabilities, type: "unsupported" };
  }
  if (capabilities.providerStatus === "not_configured") {
    return {
      message: "Voice needs OPENAI_API_KEY on the runtime. Typed requests still work.",
      type: "not_configured",
    };
  }
  return { capabilities, type: "configured" };
}

function useActiveConnectedRuntimeId(): string | null {
  const snapshot = useRuntimeStore((state) => state.snapshot);
  return snapshot?.connection.status === "connected" ? snapshot.activeRuntimeId : null;
}
