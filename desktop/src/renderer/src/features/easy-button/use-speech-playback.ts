import { useCallback, useEffect, useRef, useState } from "react";

import { useRuntimeStore } from "../../stores/runtime-store";
import type { EasyRunSpeechPlaybackIntent } from "../../stores/easy-run-events";
import { subscribeEasyRunSpeechPlaybackIntents } from "../../stores/easy-run-store";
import {
  SpeechPlaybackController,
  type SpeechPlaybackSource,
  type SpeechPlaybackState,
  type SpeechSummarySource,
} from "./speech-playback-controller";
import { type SpeechOutputMode, useSpeechOutputMode } from "./speech-output-preference";

export interface EasyButtonSpeechPlayback {
  mode: SpeechOutputMode;
  preemptForRecording: () => void;
  releaseSummary: (source: SpeechSummarySource) => void;
  replaySummary: (source: SpeechSummarySource) => void;
  setMode: (mode: SpeechOutputMode) => void;
  state: SpeechPlaybackState;
  stop: () => void;
}

export interface AutomaticSpeechPlaybackContext {
  mode: SpeechOutputMode;
  outputConfigured: boolean;
  runtimeId: string | null;
  workspaceId: string | null;
}

export function useSpeechPlayback(
  workspaceId: string | null,
  outputConfigured: boolean,
): EasyButtonSpeechPlayback {
  const runtimeId = useActiveConnectedRuntimeId();
  const mountedRef = useRef(true);
  const [state, setState] = useState<SpeechPlaybackState>({ type: "idle" });
  const [mode, persistMode] = useSpeechOutputMode();
  const controllerRef = useRef<SpeechPlaybackController | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = new SpeechPlaybackController({
      onStateChange: (nextState) => {
        if (mountedRef.current) {
          setState(nextState);
        }
      },
    });
  }
  const controller = controllerRef.current;
  const automaticPlaybackContextRef = useRef<AutomaticSpeechPlaybackContext>({
    mode,
    outputConfigured,
    runtimeId,
    workspaceId,
  });
  automaticPlaybackContextRef.current = { mode, outputConfigured, runtimeId, workspaceId };

  useEffect(() => {
    controller.reset();
  }, [controller, runtimeId, workspaceId]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      controller.dispose();
    };
  }, [controller]);

  useEffect(() => {
    return subscribeEasyRunSpeechPlaybackIntents((intent) => {
      const source = automaticSpeechPlaybackSource(intent, automaticPlaybackContextRef.current);
      if (source) {
        controller.enqueueAutomatic(source);
      }
    });
  }, [controller]);

  const setMode = useCallback(
    (nextMode: SpeechOutputMode) => {
      persistMode(nextMode);
      if (nextMode === "off") {
        controller.reset();
      }
    },
    [controller, persistMode],
  );

  return {
    mode,
    preemptForRecording: controller.reset,
    releaseSummary: controller.releaseSummary,
    replaySummary: controller.replaySummary,
    setMode,
    state,
    stop: controller.stop,
  };
}

export function automaticSpeechPlaybackSource(
  intent: EasyRunSpeechPlaybackIntent,
  context: AutomaticSpeechPlaybackContext,
): SpeechPlaybackSource | null {
  if (
    !context.outputConfigured ||
    !context.runtimeId ||
    intent.source.workspaceId !== context.workspaceId
  ) {
    return null;
  }
  switch (intent.type) {
    case "terminal_summary":
      return context.mode === "off" ? null : { ...intent.source, kind: "terminal_summary" };
    case "highlight":
      return context.mode === "highlights_and_final"
        ? { ...intent.source, kind: "highlight" }
        : null;
  }
}

function useActiveConnectedRuntimeId(): string | null {
  const snapshot = useRuntimeStore((state) => state.snapshot);
  return snapshot?.connection.status === "connected" ? snapshot.activeRuntimeId : null;
}
