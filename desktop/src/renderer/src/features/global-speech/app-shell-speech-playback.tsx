import type { SettaAPI } from "@shared/types";
import { type ReactNode, useEffect, useLayoutEffect, useMemo, useState } from "react";

import { registerRendererPageTeardown } from "../../renderer-page-lifecycle";
import {
  AppShellSpeechPlaybackController,
  type SpeechPlaybackControllerDependencies,
} from "./app-shell-speech-playback-controller";
import { createOpenAIBackendSpeechOutputProvider } from "./openai-speech-output-provider";
import { readSpeechPlaybackMutePreference } from "./speech-playback-mute-preference";

/**
 * Owns the app-shell playback controller and hands it to the one subtree that
 * speaks. The controller is passed down directly rather than through context:
 * the shell drives it by calling it, so a context would be a second way to reach
 * the same object, and subscribing to its snapshot here would re-render the
 * whole shell on every playback change for a value nothing renders.
 */
export function AppShellSpeechPlaybackProvider({
  children,
  runtimeId,
  setta,
}: {
  children: (controller: AppShellSpeechPlaybackController) => ReactNode;
  runtimeId: string | null;
  setta: SettaAPI;
}) {
  const [controller] = useState(() => {
    const created = new AppShellSpeechPlaybackController(browserPlaybackDependencies(setta));
    created.setMuted(readSpeechPlaybackMutePreference(globalThis.localStorage));
    return created;
  });
  const [effectLifetime] = useState(() => new AppShellSpeechPlaybackEffectLifetime());
  const content = useMemo(() => children(controller), [children, controller]);

  useLayoutEffect(() => effectLifetime.mount(controller), [controller, effectLifetime]);
  useLayoutEffect(() => registerRendererPageTeardown(() => controller.dispose()), [controller]);
  useEffect(() => controller.synchronizeRuntime(runtimeId), [controller, runtimeId]);

  return content;
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
  const outputProvider = createOpenAIBackendSpeechOutputProvider(setta);
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
      const operationId = createSpeechSynthesisOperationId();
      return abortableSpeechRequest(
        () => outputProvider.synthesize(request, operationId),
        () => outputProvider.cancel(operationId),
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
    return Promise.reject(speechSynthesisStoppedError());
  }
  return new Promise<T>((resolve, reject) => {
    const aborted = () => {
      void cancel().catch(() => undefined);
      reject(speechSynthesisStoppedError());
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

function speechSynthesisStoppedError(): DOMException {
  return new DOMException("Speech synthesis was stopped.", "AbortError");
}
