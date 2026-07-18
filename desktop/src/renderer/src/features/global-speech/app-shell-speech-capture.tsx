import type { SettaAPI } from "@shared/types";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import { registerRendererPageTeardown } from "../../renderer-page-lifecycle";
import type { AppShellMasterController } from "../global-master/app-shell-master-controller";
import { applyConversationRoutingPresentation } from "../easy-button/conversation-routing-presentation";
import {
  AppShellSpeechCaptureController,
  type AppShellSpeechCaptureControllerDependencies,
  type AppShellSpeechCaptureSnapshot,
  browserSpeechCaptureSupport,
} from "./app-shell-speech-capture-controller";
import type { AppShellSpeechPlaybackController } from "./app-shell-speech-playback-controller";
import type { GlobalSpeechPresentationSource } from "./global-speech-presentation";
import { createBufferedMicrophoneCapture } from "./buffered-microphone-capture";
import { createRealtimeTranscriptionTransport } from "./realtime-transcription-transport";

export interface AppShellSpeechCaptureContextValue {
  controller: AppShellSpeechCaptureController;
  snapshot: AppShellSpeechCaptureSnapshot;
}

const AppShellSpeechCaptureContext = createContext<AppShellSpeechCaptureContextValue | null>(null);

export function useAppShellSpeechCapture(): AppShellSpeechCaptureContextValue | null {
  return useContext(AppShellSpeechCaptureContext);
}

export function AppShellSpeechCaptureProvider({
  children,
  master,
  onCaptureEnd,
  onCaptureStart,
  playback,
  runtimeId,
  setta,
}: {
  children:
    | ReactNode
    | ((
        controller: AppShellSpeechCaptureController,
        presentation: GlobalSpeechPresentationSource,
      ) => ReactNode);
  master: AppShellMasterController;
  onCaptureEnd?: () => void;
  onCaptureStart?: () => void;
  playback: AppShellSpeechPlaybackController;
  runtimeId: string | null;
  setta: SettaAPI;
}) {
  const [controller] = useState(
    () =>
      new AppShellSpeechCaptureController(
        browserControllerDependencies(setta, onCaptureStart, onCaptureEnd),
        master,
      ),
  );
  const [effectLifetime] = useState(() => new AppShellSpeechCaptureEffectLifetime());
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const context = useMemo(() => ({ controller, snapshot }), [controller, snapshot]);
  const presentation = useMemo(() => ({ capture: controller, playback }), [controller, playback]);
  const content = useMemo(
    () => (typeof children === "function" ? children(controller, presentation) : children),
    [children, controller, presentation],
  );

  useLayoutEffect(() => effectLifetime.mount(controller), [controller, effectLifetime]);
  useLayoutEffect(() => registerRendererPageTeardown(() => controller.dispose()), [controller]);
  useEffect(() => {
    void controller.synchronizeRuntime(runtimeId);
  }, [controller, runtimeId]);

  return (
    <AppShellSpeechCaptureContext.Provider value={context}>
      {content}
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

  constructor(private readonly schedule: (handler: () => void) => void = scheduleMicrotask) {}

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

function scheduleMicrotask(handler: () => void): void {
  queueMicrotask(handler);
}

function browserControllerDependencies(
  setta: SettaAPI,
  onCaptureStart: (() => void) | undefined,
  onCaptureEnd: (() => void) | undefined,
): AppShellSpeechCaptureControllerDependencies {
  return {
    clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
    createBufferedCapture: createBufferedMicrophoneCapture,
    createCaptureSessionId: () => globalThis.crypto.randomUUID(),
    createTranscriptionSession: () => setta.speech.createTranscriptionSession(),
    createTransport: createRealtimeTranscriptionTransport,
    getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
    now: () => new Date(),
    onCaptureEnd: onCaptureEnd ?? (() => {}),
    onCaptureStart: onCaptureStart ?? (() => {}),
    readCapabilities: () => setta.speech.readCapabilities(),
    settleConversationInput: async (accepted, completed) => {
      if (!setta.conversations.waitInputState) {
        throw new Error("the desktop conversation routing boundary is unavailable");
      }
      const workspaceId = completed.request.destination.workspaceId;
      const state = await setta.conversations.waitInputState({
        conversationId: accepted.input.conversationId,
        inputId: accepted.input.id,
        workspaceId,
      });
      await applyConversationRoutingPresentation(workspaceId, state);
    },
    setTimeout: (handler, delayMs) => globalThis.setTimeout(handler, delayMs),
    support: browserSpeechCaptureSupport,
    submitConversationInput: (request) => {
      if (!setta.conversations.submitInput) {
        return Promise.reject(new Error("the desktop conversation input boundary is unavailable"));
      }
      return setta.conversations.submitInput(request);
    },
  };
}
