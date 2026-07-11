import { useCallback, useEffect, useRef, useState } from "react";

import { useRuntimeStore } from "../../stores/runtime-store";
import {
  SpeechPlaybackController,
  type SpeechPlaybackState,
  type SpeechSummarySource,
} from "./speech-playback-controller";
import { type SpeechOutputMode, useSpeechOutputMode } from "./speech-output-preference";

export interface EasyButtonSpeechPlayback {
  mode: SpeechOutputMode;
  releaseSummary: (source: SpeechSummarySource) => void;
  replaySummary: (source: SpeechSummarySource) => void;
  setMode: (mode: SpeechOutputMode) => void;
  state: SpeechPlaybackState;
  stop: () => void;
}

export function useSpeechPlayback(workspaceId: string | null): EasyButtonSpeechPlayback {
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

  useEffect(() => {
    controller.reset();
  }, [controller, runtimeId, workspaceId]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      controller.dispose();
    };
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
    releaseSummary: controller.releaseSummary,
    replaySummary: controller.replaySummary,
    setMode,
    state,
    stop: controller.stop,
  };
}

function useActiveConnectedRuntimeId(): string | null {
  const snapshot = useRuntimeStore((state) => state.snapshot);
  return snapshot?.connection.status === "connected" ? snapshot.activeRuntimeId : null;
}
