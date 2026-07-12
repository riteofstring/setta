import type { SettaAPI } from "@shared/types";
import {
  createContext,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  AppShellSpeechCaptureController,
  type AppShellSpeechCaptureControllerDependencies,
  type AppShellSpeechCaptureSnapshot,
  browserSpeechCaptureSupport,
} from "./app-shell-speech-capture-controller";
import {
  readGlobalMicrophonePreference,
  type GlobalMicrophonePreference,
  writeGlobalMicrophonePreference,
} from "./global-microphone-preference";
import { createRealtimeTranscriptionTransport } from "./realtime-transcription-transport";
import type { MasterInputFocusHints } from "./global-speech-master-submission";

interface AppShellSpeechCaptureContextValue {
  controller: AppShellSpeechCaptureController;
  snapshot: AppShellSpeechCaptureSnapshot;
}

const AppShellSpeechCaptureContext = createContext<AppShellSpeechCaptureContextValue | null>(null);

export function AppShellSpeechCaptureProvider({
  children,
  focusHints,
  runtimeId,
  setta,
}: {
  children: ReactNode;
  focusHints: MasterInputFocusHints;
  runtimeId: string | null;
  setta: SettaAPI;
}) {
  const focusHintsRef = useRef(focusHints);
  focusHintsRef.current = focusHints;
  const [controller] = useState(
    () =>
      new AppShellSpeechCaptureController(
        browserControllerDependencies(setta, () => focusHintsRef.current),
      ),
  );
  const [effectLifetime] = useState(() => new AppShellSpeechCaptureEffectLifetime());
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const context = useMemo(() => ({ controller, snapshot }), [controller, snapshot]);

  useEffect(() => effectLifetime.mount(controller), [controller, effectLifetime]);
  useEffect(() => {
    void controller.synchronizeRuntime(runtimeId);
  }, [controller, runtimeId]);

  return (
    <AppShellSpeechCaptureContext.Provider value={context}>
      {children}
    </AppShellSpeechCaptureContext.Provider>
  );
}

interface SpeechCaptureControllerDisposable {
  dispose: () => void;
}

interface PendingControllerDisposal {
  canceled: boolean;
  controller: SpeechCaptureControllerDisposable;
}

export class AppShellSpeechCaptureEffectLifetime {
  private pendingDisposal: PendingControllerDisposal | null = null;

  constructor(private readonly schedule: (handler: () => void) => void = queueMicrotask) {}

  mount(controller: SpeechCaptureControllerDisposable): () => void {
    if (this.pendingDisposal?.controller === controller) {
      this.pendingDisposal.canceled = true;
      this.pendingDisposal = null;
    }
    return () => {
      const pending = { canceled: false, controller } satisfies PendingControllerDisposal;
      this.pendingDisposal = pending;
      this.schedule(() => {
        if (pending.canceled) {
          return;
        }
        if (this.pendingDisposal === pending) {
          this.pendingDisposal = null;
        }
        controller.dispose();
      });
    };
  }
}

function browserControllerDependencies(
  setta: SettaAPI,
  readFocusHints: () => MasterInputFocusHints,
): AppShellSpeechCaptureControllerDependencies {
  return {
    clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
    createCaptureSessionId: () => globalThis.crypto.randomUUID(),
    createTranscriptionSession: () => setta.speech.createTranscriptionSession(),
    createTransport: createRealtimeTranscriptionTransport,
    getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
    now: () => new Date(),
    readCapabilities: () => setta.speech.readCapabilities(),
    readFocusHints,
    readPreference: readBrowserGlobalMicrophonePreference,
    setTimeout: (handler, delayMs) => globalThis.setTimeout(handler, delayMs),
    support: browserSpeechCaptureSupport,
    submitMasterInput: (request) => {
      if (!setta.master) {
        return Promise.reject(new Error("the desktop master input boundary is unavailable"));
      }
      return setta.master.submitInput(request);
    },
    writePreference: writeBrowserGlobalMicrophonePreference,
  };
}

function readBrowserGlobalMicrophonePreference(): GlobalMicrophonePreference {
  try {
    return readGlobalMicrophonePreference(globalThis.localStorage);
  } catch {
    return { message: "The global microphone preference could not be read.", type: "failed" };
  }
}

function writeBrowserGlobalMicrophonePreference(enabled: boolean): GlobalMicrophonePreference {
  try {
    return writeGlobalMicrophonePreference(globalThis.localStorage, enabled);
  } catch {
    return { message: "The global microphone preference could not be saved.", type: "failed" };
  }
}
