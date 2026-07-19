import type { SettaAPI } from "@shared/types";
import { describe, expect, test, vi } from "vitest";

import {
  AppShellSpeechCaptureEffectLifetime,
  subscribeSpeechCredentialCapabilityRefresh,
} from "./app-shell-speech-capture";

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

describe("app-shell speech capture provider credential refresh", () => {
  test("refreshes capture capabilities after speech credential settings change", async () => {
    const listeners: Array<() => void> = [];
    const unsubscribe = vi.fn();
    const setta = {
      speech: {
        onCredentialSettingsChanged: vi.fn((next: () => void) => {
          listeners.push(next);
          return unsubscribe;
        }),
      },
    } as unknown as SettaAPI;
    const controller = {
      refreshCapabilities: vi.fn(async () => {}),
    };

    const cleanup = subscribeSpeechCredentialCapabilityRefresh(setta, controller);
    const listener = listeners[0];
    if (!listener) {
      throw new Error("speech credential listener was not subscribed");
    }
    listener();
    await Promise.resolve();
    cleanup();

    expect(setta.speech.onCredentialSettingsChanged).toHaveBeenCalledOnce();
    expect(controller.refreshCapabilities).toHaveBeenCalledOnce();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});

function drain(scheduled: Array<() => void>): void {
  for (const handler of scheduled.splice(0)) {
    handler();
  }
}
