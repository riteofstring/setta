import type { SettaAPI } from "@shared/types";
import type { LocalMacOSVoiceModelDownloadStatus } from "@shared/speech-ipc";
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
import {
  applyConversationRoutingPresentation,
  isConversationRoutingFailure,
} from "../easy-button/conversation-routing-presentation";
import {
  AppShellSpeechCaptureController,
  type AppShellSpeechCaptureControllerDependencies,
  type AppShellSpeechCaptureSnapshot,
} from "./app-shell-speech-capture-controller";
import type { AppShellSpeechPlaybackController } from "./app-shell-speech-playback-controller";
import type { GlobalSpeechPresentationSource } from "./global-speech-presentation";
import { createBrowserVoiceInputProvider } from "./browser-voice-input-provider";

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
  useEffect(() => subscribeSpeechCapabilityRefresh(setta, controller), [controller, setta]);

  return (
    <AppShellSpeechCaptureContext.Provider value={context}>
      {content}
    </AppShellSpeechCaptureContext.Provider>
  );
}

export function subscribeSpeechCapabilityRefresh(
  setta: SettaAPI,
  controller: Pick<AppShellSpeechCaptureController, "refreshCapabilities">,
): () => void {
  const unsubscribeCredential =
    setta.speech.onCredentialSettingsChanged?.(() => {
      void controller.refreshCapabilities();
    }) ?? (() => {});
  const unsubscribeProvider =
    setta.speech.onProviderSelectionChanged?.(() => {
      void controller.refreshCapabilities();
    }) ?? (() => {});
  const unsubscribeLocalMacOSDownload =
    setta.speech.onLocalMacOSVoiceModelDownloadChanged?.((status) => {
      if (localMacOSDownloadChangesCaptureReadiness(status)) {
        void controller.refreshCapabilities();
      }
    }) ?? (() => {});
  return () => {
    unsubscribeCredential();
    unsubscribeLocalMacOSDownload();
    unsubscribeProvider();
  };
}

function localMacOSDownloadChangesCaptureReadiness(
  status: LocalMacOSVoiceModelDownloadStatus,
): boolean {
  return status.status === "ready";
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
    captureProvider: createBrowserVoiceInputProvider(setta),
    clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
    createCaptureSessionId: () => globalThis.crypto.randomUUID(),
    now: () => new Date(),
    onCaptureEnd: onCaptureEnd ?? (() => {}),
    onCaptureStart: onCaptureStart ?? (() => {}),
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
      try {
        await applyConversationRoutingPresentation(workspaceId, state);
      } catch (error) {
        if (!isConversationRoutingFailure(error)) {
          throw error;
        }
      }
    },
    setTimeout: (handler, delayMs) => globalThis.setTimeout(handler, delayMs),
    submitConversationInput: (request) => {
      if (!setta.conversations.submitInput) {
        return Promise.reject(new Error("the desktop conversation input boundary is unavailable"));
      }
      return setta.conversations.submitInput(request);
    },
  };
}
