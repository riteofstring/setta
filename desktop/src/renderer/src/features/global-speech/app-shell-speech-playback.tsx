import type { ConversationEvent, ConversationSnapshot, TurnStatus } from "@generated/backend";
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

import { queuedConversationProjectionEventsBefore } from "../../stores/conversation-projection-runtime";
import { useConversationStore } from "../../stores/conversation-store";
import { registerRendererPageTeardown } from "../../renderer-page-lifecycle";
import {
  AppShellSpeechPlaybackController,
  narrationSpeechPlaybackIntent,
  type SpeechPlaybackControllerDependencies,
  type SpeechPlaybackSnapshot,
} from "./app-shell-speech-playback-controller";

export interface AppShellSpeechPlaybackContextValue {
  controller: AppShellSpeechPlaybackController;
  snapshot: SpeechPlaybackSnapshot;
}

const AppShellSpeechPlaybackContext = createContext<AppShellSpeechPlaybackContextValue | null>(
  null,
);

export function useAppShellSpeechPlayback(): AppShellSpeechPlaybackContextValue | null {
  return useContext(AppShellSpeechPlaybackContext);
}

export function AppShellSpeechPlaybackProvider({
  children,
  runtimeId,
  setta,
}: {
  children: ReactNode | ((controller: AppShellSpeechPlaybackController) => ReactNode);
  runtimeId: string | null;
  setta: SettaAPI;
}) {
  const [controller] = useState(
    () => new AppShellSpeechPlaybackController(browserPlaybackDependencies(setta)),
  );
  const [effectLifetime] = useState(() => new AppShellSpeechPlaybackEffectLifetime());
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const context = useMemo(() => ({ controller, snapshot }), [controller, snapshot]);
  const content = useMemo(
    () => (typeof children === "function" ? children(controller) : children),
    [children, controller],
  );

  useLayoutEffect(() => effectLifetime.mount(controller), [controller, effectLifetime]);
  useLayoutEffect(() => registerRendererPageTeardown(() => controller.dispose()), [controller]);
  useEffect(() => controller.synchronizeRuntime(runtimeId), [controller, runtimeId]);
  useEffect(
    () =>
      setta.conversations.onEvent((event) => handlePlaybackConversationEvent(controller, event)),
    [controller, setta],
  );

  return (
    <AppShellSpeechPlaybackContext.Provider value={context}>
      {content}
    </AppShellSpeechPlaybackContext.Provider>
  );
}

export function handlePlaybackConversationEvent(
  controller: AppShellSpeechPlaybackController,
  event: ConversationEvent,
): void {
  if (event.payload.type !== "conversation.narration.created") {
    return;
  }
  const snapshot = useConversationStore
    .getState()
    .conversations.get(event.conversationId)?.snapshot;
  if (!snapshot) {
    throw new Error(
      `live narration event ${event.payload.event.id} arrived without its conversation projection`,
    );
  }
  const eventState = playbackEventState(snapshot, event);
  const intent = narrationSpeechPlaybackIntent(
    event.payload.event,
    eventState.presentationProfile,
    eventState.turnStatus,
  );
  if (intent) {
    controller.enqueueAutomatic(intent);
  }
}

function playbackEventState(
  snapshot: ConversationSnapshot,
  event: ConversationEvent,
): {
  presentationProfile: ConversationSnapshot["presentationProfile"];
  turnStatus: TurnStatus | null;
} {
  const turnId =
    event.payload.type === "conversation.narration.created" ? event.payload.event.turnId : null;
  let presentationProfile = snapshot.presentationProfile;
  let turnStatus = narrationTurnStatus(turnId, snapshot);
  for (const queued of queuedConversationProjectionEventsBefore(event)) {
    if (queued.sequence <= snapshot.eventCursor.sequence) {
      continue;
    }
    if (queued.payload.type === "conversation.presentation_profile.updated") {
      presentationProfile = queued.payload.profile;
    }
    if (queued.payload.type === "conversation.turn.updated" && queued.payload.turn.id === turnId) {
      turnStatus = queued.payload.turn.status;
    }
  }
  return { presentationProfile, turnStatus };
}

function narrationTurnStatus(
  turnId: string | null,
  snapshot: ConversationSnapshot,
): TurnStatus | null {
  if (turnId === null) {
    return null;
  }
  return snapshot.turns.turns.find((turn) => turn.id === turnId)?.status ?? null;
}

interface SpeechPlaybackControllerDisposable {
  dispose: () => void;
}

interface PendingControllerDisposal {
  canceled: boolean;
  controller: SpeechPlaybackControllerDisposable;
}

export class AppShellSpeechPlaybackEffectLifetime {
  private pendingDisposal: PendingControllerDisposal | null = null;

  constructor(private readonly schedule: (handler: () => void) => void = scheduleMicrotask) {}

  mount(controller: SpeechPlaybackControllerDisposable): () => void {
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

function browserPlaybackDependencies(setta: SettaAPI): SpeechPlaybackControllerDependencies {
  return {
    createAbortController: () => new AbortController(),
    createAudio: (url) => new Audio(url),
    createObjectURL: (blob) => URL.createObjectURL(blob),
    decodeBase64,
    logPlayback: (observation) => {
      console.info(JSON.stringify({ type: "speech_playback", ...observation }));
    },
    logSupersession: (decision) => {
      console.info(JSON.stringify({ type: "speech_playback_supersession", ...decision }));
    },
    now: () => Date.now(),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
    synthesize: (request, signal) => {
      if (!setta.speech.synthesize || !setta.speech.cancelSynthesis) {
        return Promise.reject(new Error("the desktop speech synthesis boundary is unavailable"));
      }
      const operationId = createSpeechSynthesisOperationId();
      return abortableSpeechRequest(
        () => setta.speech.synthesize!(request, operationId),
        () => setta.speech.cancelSynthesis!(operationId),
        signal,
      );
    },
  };
}

let nextSpeechSynthesisOperationSequence = 1;

function createSpeechSynthesisOperationId(): string {
  const pageEpoch = Math.trunc(globalThis.performance.timeOrigin * 1000).toString(36);
  const sequence = nextSpeechSynthesisOperationSequence.toString(36);
  nextSpeechSynthesisOperationSequence += 1;
  return `speech_${pageEpoch}_${sequence}`;
}

function decodeBase64(value: string): Uint8Array {
  const decoded = globalThis.atob(value);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes;
}

function abortableSpeechRequest<T>(
  start: () => Promise<T>,
  cancel: () => Promise<void>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(new DOMException("Speech synthesis was stopped.", "AbortError"));
  }
  return new Promise<T>((resolve, reject) => {
    const aborted = () => {
      void cancel().catch(() => undefined);
      reject(new DOMException("Speech synthesis was stopped.", "AbortError"));
    };
    signal.addEventListener("abort", aborted, { once: true });
    void start().then(
      (value) => {
        signal.removeEventListener("abort", aborted);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", aborted);
        reject(error);
      },
    );
  });
}
