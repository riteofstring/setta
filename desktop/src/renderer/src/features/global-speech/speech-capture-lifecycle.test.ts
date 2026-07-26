import type { LocalMacOSVoiceModelDownloadStatus } from "@shared/speech-ipc";
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
    const downloadListeners: Array<(status: LocalMacOSVoiceModelDownloadStatus) => void> = [];
    const providerListeners: Array<() => void> = [];
    const unsubscribeCredential = vi.fn();
    const unsubscribeDownload = vi.fn();
    const unsubscribeProvider = vi.fn();
    const setta = {
      speech: {
        onCredentialSettingsChanged: vi.fn((next: () => void) => {
          credentialListeners.push(next);
          return unsubscribeCredential;
        }),
        onLocalMacOSVoiceModelDownloadChanged: vi.fn((next) => {
          downloadListeners.push(next);
          return unsubscribeDownload;
        }),
        onProviderSelectionChanged: vi.fn((next: () => void) => {
          providerListeners.push(next);
          return unsubscribeProvider;
        }),
      },
    } as unknown as SettaAPI;
    const controller = {
      refreshCapabilities: vi.fn(async () => {}),
    };

    const cleanup = subscribeSpeechCapabilityRefresh(setta, controller);
    const credentialListener = credentialListeners[0];
    const downloadListener = downloadListeners[0];
    const providerListener = providerListeners[0];
    if (!credentialListener || !downloadListener || !providerListener) {
      throw new Error("speech setup listeners were not subscribed");
    }
    credentialListener();
    downloadListener(localMacOSModelDownloadStatus("downloading"));
    downloadListener(localMacOSModelDownloadStatus("ready"));
    providerListener();
    await Promise.resolve();
    cleanup();

    expect(setta.speech.onCredentialSettingsChanged).toHaveBeenCalledOnce();
    expect(setta.speech.onLocalMacOSVoiceModelDownloadChanged).toHaveBeenCalledOnce();
    expect(setta.speech.onProviderSelectionChanged).toHaveBeenCalledOnce();
    expect(controller.refreshCapabilities).toHaveBeenCalledTimes(3);
    expect(unsubscribeCredential).toHaveBeenCalledOnce();
    expect(unsubscribeDownload).toHaveBeenCalledOnce();
    expect(unsubscribeProvider).toHaveBeenCalledOnce();
  });
});

function drain(scheduled: Array<() => void>): void {
  for (const handler of scheduled.splice(0)) {
    handler();
  }
}

function localMacOSModelDownloadStatus(
  status: "downloading" | "ready",
): LocalMacOSVoiceModelDownloadStatus {
  const base = {
    bytesTotal: 147_964_211,
    modelName: "base.en",
    modelPath: "/tmp/ggml-base.en.bin",
    modelSHA256: "a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002",
    provider: "local_macos" as const,
  };
  switch (status) {
    case "downloading":
      return { ...base, bytesDownloaded: 1_000_000, status };
    case "ready":
      return { ...base, status };
    default:
      return status satisfies never;
  }
}
