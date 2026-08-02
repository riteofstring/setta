import type { SettaAPI } from "@shared/types";
import { describe, expect, test, vi } from "vitest";

import {
  AppShellSpeechCaptureEffectLifetime,
  subscribeSpeechCapabilityRefresh,
} from "./speech-capture-lifecycle";

describe("app-shell speech capture provider lifetime", () => {
  test("survives StrictMode effect replay before disposing the real unmount", () => {
    const scheduled: Array<() => void> = [];
    const dispose = vi.fn();
    const controller = { dispose };
    const lifetime = new AppShellSpeechCaptureEffectLifetime((handler) => scheduled.push(handler));

    const cleanupInitialEffect = lifetime.mount(controller);
    cleanupInitialEffect();
    const cleanupReplayedEffect = lifetime.mount(controller);
    drain(scheduled);

    expect(dispose).not.toHaveBeenCalled();

    cleanupReplayedEffect();
    drain(scheduled);

    expect(dispose).toHaveBeenCalledOnce();
  });

  test("does not retain a replaced controller", () => {
    const scheduled: Array<() => void> = [];
    const firstDispose = vi.fn();
    const secondDispose = vi.fn();
    const first = { dispose: firstDispose };
    const second = { dispose: secondDispose };
    const lifetime = new AppShellSpeechCaptureEffectLifetime((handler) => scheduled.push(handler));

    lifetime.mount(first)();
    const cleanupSecond = lifetime.mount(second);
    drain(scheduled);

    expect(firstDispose).toHaveBeenCalledOnce();
    expect(secondDispose).not.toHaveBeenCalled();

    cleanupSecond();
    drain(scheduled);

    expect(secondDispose).toHaveBeenCalledOnce();
  });
});

describe("app-shell speech capture provider capability refresh", () => {
  test("refreshes capture capabilities after speech setup changes", async () => {
    const credentialListeners: Array<() => void> = [];
    const unsubscribeCredential = vi.fn();
    const setta = {
      speech: {
        onCredentialSettingsChanged: vi.fn((next: () => void) => {
          credentialListeners.push(next);
          return unsubscribeCredential;
        }),
      },
    } as unknown as SettaAPI;
    const controller = {
      refreshCapabilities: vi.fn(async () => {}),
    };

    const cleanup = subscribeSpeechCapabilityRefresh(setta, controller);
    const credentialListener = credentialListeners[0];
    if (!credentialListener) {
      throw new Error("speech setup listeners were not subscribed");
    }
    credentialListener();
    await Promise.resolve();
    cleanup();

    expect(setta.speech.onCredentialSettingsChanged).toHaveBeenCalledOnce();
    expect(controller.refreshCapabilities).toHaveBeenCalledOnce();
    expect(unsubscribeCredential).toHaveBeenCalledOnce();
  });
});

function drain(scheduled: Array<() => void>): void {
  for (const handler of scheduled.splice(0)) {
    handler();
  }
}
