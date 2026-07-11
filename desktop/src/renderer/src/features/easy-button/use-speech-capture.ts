import type { SpeechCapabilities } from "@generated/backend";
import { useCallback, useEffect, useRef, useState } from "react";

import { useRuntimeStore } from "../../stores/runtime-store";
import {
  browserSpeechCaptureSupport,
  SpeechCaptureController,
  speechCaptureIsActive,
  type SpeechCaptureFailureCode,
  type SpeechCaptureIntent,
  type SpeechCaptureState,
} from "./speech-capture-controller";

export type SpeechCaptureAvailability =
  | { type: "loading" }
  | { capabilities: SpeechCapabilities; type: "configured" }
  | { message: string; type: "not_configured" }
  | {
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
  const [state, setState] = useState<SpeechCaptureState>({ type: "idle" });
  const [capabilitiesState, setCapabilitiesState] = useState<SpeechCaptureAvailability>({
    type: "loading",
  });
  const controllerRef = useRef<SpeechCaptureController | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = new SpeechCaptureController({
      onCompletedTranscript: (transcript, intent) => completionRef.current(transcript, intent),
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
          setCapabilitiesState(availabilityForCapabilities(capabilities));
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
      if (!workspaceId || capabilitiesState.type !== "configured") {
        return;
      }
      void controller.start({
        capabilities: capabilitiesState.capabilities,
        intent,
        workspaceId,
      });
    },
    [capabilitiesState, controller, workspaceId],
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

function availabilityForCapabilities(capabilities: SpeechCapabilities): SpeechCaptureAvailability {
  if (capabilities.providerStatus === "not_configured") {
    return {
      message: "Voice needs OPENAI_API_KEY on the runtime. Typed requests still work.",
      type: "not_configured",
    };
  }
  const support = browserSpeechCaptureSupport();
  if (!support.supported) {
    return { ...support, type: "unsupported" };
  }
  return { capabilities, type: "configured" };
}

function useActiveConnectedRuntimeId(): string | null {
  const snapshot = useRuntimeStore((state) => state.snapshot);
  return snapshot?.connection.status === "connected" ? snapshot.activeRuntimeId : null;
}
