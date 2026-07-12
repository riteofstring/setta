import type { ConversationEvent, ConversationSnapshot, TurnStatus } from "@generated/backend";
import type { SettaAPI } from "@shared/types";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import { useConversationStore } from "../../stores/conversation-store";
import {
  AppShellSpeechPlaybackController,
  narrationSpeechPlaybackIntent,
  type SpeechPlaybackControllerDependencies,
} from "./app-shell-speech-playback-controller";

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
  const content = useMemo(
    () => (typeof children === "function" ? children(controller) : children),
    [children, controller],
  );

  useEffect(() => effectLifetime.mount(controller), [controller, effectLifetime]);
  useEffect(() => controller.synchronizeRuntime(runtimeId), [controller, runtimeId]);
  useEffect(
    () =>
      setta.conversations.onEvent((event) => handlePlaybackConversationEvent(controller, event)),
    [controller, setta],
  );

  return content;
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
  const intent = narrationSpeechPlaybackIntent(
    event.payload.event,
    snapshot.presentationProfile,
    narrationTurnStatus(event.payload.event.turnId, snapshot),
  );
  if (intent) {
    controller.enqueueAutomatic(intent);
  }
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

  constructor(private readonly schedule: (handler: () => void) => void = queueMicrotask) {}

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

function browserPlaybackDependencies(setta: SettaAPI): SpeechPlaybackControllerDependencies {
  return {
    createAbortController: () => new AbortController(),
    createAudio: (url) => new Audio(url),
    createObjectURL: (blob) => URL.createObjectURL(blob),
    decodeBase64,
    logSupersession: (decision) => {
      console.info(
        `Speech playback superseded source=${decision.superseded.source.eventId} ` +
          `by=${decision.superseding.source.eventId} reason=${decision.reason}`,
      );
    },
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
