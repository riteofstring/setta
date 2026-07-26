import { describe, expect, test, vi } from "vitest";

import { AppShellSpeechPlaybackEffectLifetime } from "./app-shell-speech-playback";

describe("app-shell speech playback provider", () => {
  test("survives StrictMode effect replay before disposing the real unmount", () => {
    const scheduled: Array<() => void> = [];
    const dispose = vi.fn();
    const controller = { dispose };
    const lifetime = new AppShellSpeechPlaybackEffectLifetime((handler) => scheduled.push(handler));

    lifetime.mount(controller)();
    const cleanup = lifetime.mount(controller);
    drain(scheduled);
    expect(dispose).not.toHaveBeenCalled();

    cleanup();
    drain(scheduled);
    expect(dispose).toHaveBeenCalledOnce();
  });
});

function drain(scheduled: Array<() => void>): void {
  for (const handler of scheduled.splice(0)) {
    handler();
  }
}
