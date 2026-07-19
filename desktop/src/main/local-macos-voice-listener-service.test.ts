import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import type { LocalMacOSVoiceHealth, LocalMacOSVoiceListenerEvent } from "@shared/speech-ipc";
import { describe, expect, test, vi } from "vitest";

import type {
  LocalMacOSVoiceHelper,
  LocalMacOSVoiceListenerEventHandler,
} from "./local-macos-voice-helper";
import { LocalMacOSVoiceListenerService } from "./local-macos-voice-listener-service";

describe("local macOS voice listener service", () => {
  test("starts the listener and publishes a finalized wake transcript", async () => {
    const harness = await createHarness();
    try {
      await harness.service.updateSettings(true);
      harness.emit({ type: "listener_armed" });
      harness.emit({ score: 0.74, timeMs: 960, type: "wake_detected" });
      harness.emit({ timeMs: 1_140, type: "message_speech_started" });
      harness.emit({ timeMs: 2_220, type: "candidate_endpoint_detected" });
      harness.emit({ transcript: "open the release checklist", type: "utterance_finalized" });

      await vi.waitFor(() =>
        expect(harness.events.some((event) => event.type === "wake_transcript")).toBe(true),
      );
      const wake = harness.events.find((event) => event.type === "wake_transcript");
      expect(wake).toMatchObject({
        captureSessionId: "wake_1",
        transcript: "open the release checklist",
        type: "wake_transcript",
      });
      expect(wake?.settings.state).toEqual({
        status: "submitting",
        transcript: "open the release checklist",
      });

      const completed = await harness.service.completeSubmission("wake_1");
      expect(completed.state).toEqual({ status: "armed" });
      expect(harness.helper.startListener).toHaveBeenCalledWith(
        expect.objectContaining({
          runtime: "onnx",
          wakeModelPath: harness.wakeModelPath,
          wakeModelSHA256: "a".repeat(64),
        }),
        expect.any(Function),
      );
    } finally {
      await harness.cleanup();
    }
  });

  test("pauses and resumes an armed listener around manual capture", async () => {
    const harness = await createHarness();
    try {
      await harness.service.updateSettings(true);
      harness.emit({ type: "listener_armed" });
      await vi.waitFor(() =>
        expect(harness.events.at(-1)?.settings.state).toEqual({ status: "armed" }),
      );

      const prepared = await harness.service.prepareManualCaptureStart("capture_manual");
      expect(prepared).toEqual({ status: "ready" });
      expect(harness.helper.pauseListener).toHaveBeenCalledWith({ reason: "manual_capture" });
      expect(harness.events.at(-1)?.settings.state).toMatchObject({
        captureSessionId: "capture_manual",
        status: "paused_for_manual_capture",
      });

      await harness.service.finishManualCapture("capture_manual");
      expect(harness.helper.resumeListener).toHaveBeenCalledWith({ reason: "manual_capture" });
      expect(harness.events.at(-1)?.settings.state).toEqual({ status: "armed" });
    } finally {
      await harness.cleanup();
    }
  });

  test("keeps settings unavailable until local voice readiness recovers", async () => {
    const harness = await createHarness({
      initialHealth: {
        message: "The local macOS voice model has not been downloaded.",
        modelPath: "/tmp/ggml-base.en.bin",
        provider: "local_macos",
        status: "missing_model",
      },
    });
    try {
      const initial = await harness.service.readSettings();
      expect(initial).toEqual({
        availability: {
          message: "The local macOS voice model has not been downloaded.",
          setupAction: "download_local_macos_voice_model",
          status: "unavailable",
        },
        enabled: false,
        state: { status: "disabled" },
      });

      const enabled = await harness.service.updateSettings(true);
      expect(enabled).toEqual({
        availability: {
          message: "The local macOS voice model has not been downloaded.",
          setupAction: "download_local_macos_voice_model",
          status: "unavailable",
        },
        enabled: true,
        state: {
          message: "The local macOS voice model has not been downloaded.",
          status: "local_voice_not_ready",
        },
      });
      expect(harness.helper.startListener).not.toHaveBeenCalled();

      harness.setHealth({
        helperPath: "/tmp/setta-local-helper",
        modelPath: "/tmp/ggml-base.en.bin",
        modelSHA256: "b".repeat(64),
        provider: "local_macos",
        status: "ready",
      });
      const refreshed = await harness.service.refreshReadiness();
      expect(refreshed).toMatchObject({
        availability: { status: "ready" },
        enabled: true,
        state: { status: "arming" },
      });
      expect(harness.helper.startListener).toHaveBeenCalledOnce();

      harness.emit({ type: "listener_armed" });
      await vi.waitFor(() =>
        expect(harness.events.at(-1)?.settings.state).toEqual({ status: "armed" }),
      );
    } finally {
      await harness.cleanup();
    }
  });
});

async function createHarness({
  initialHealth = {
    helperPath: "/tmp/setta-local-helper",
    modelPath: "/tmp/ggml-base.en.bin",
    modelSHA256: "b".repeat(64),
    provider: "local_macos" as const,
    status: "ready" as const,
  },
}: {
  initialHealth?: LocalMacOSVoiceHealth;
} = {}) {
  const tempRoot = await mkdtemp(join(tmpdir(), "setta-listener-service-"));
  const wakeModelPath = join(tempRoot, "hey-setta.onnx");
  await writeFile(wakeModelPath, "wake-model");
  let enabled = false;
  let health = initialHealth;
  let listener: LocalMacOSVoiceListenerEventHandler | null = null;
  const events: LocalMacOSVoiceListenerEvent[] = [];
  const helper = {
    cancelCapture: vi.fn(),
    cancelSynthesis: vi.fn(),
    finishCapture: vi.fn(),
    listVoices: vi.fn(),
    pauseListener: vi.fn(async () => ({ status: "paused" as const })),
    readHealth: vi.fn(async () => health),
    resumeListener: vi.fn(async () => ({ status: "resumed" as const })),
    shutdown: vi.fn(),
    startCapture: vi.fn(),
    startListener: vi.fn(
      async (_request: unknown, onEvent: LocalMacOSVoiceListenerEventHandler) => {
        listener = onEvent;
        return { status: "started" as const };
      },
    ),
    stopListener: vi.fn(async () => ({ status: "stopped" as const })),
    synthesizeSpeech: vi.fn(),
  } satisfies LocalMacOSVoiceHelper;
  const service = new LocalMacOSVoiceListenerService({
    configuration: {
      wakeModelPath,
      wakeModelSHA256: "a".repeat(64),
      wakeRuntime: "onnx",
    },
    helper,
    onEvent: (event) => {
      events.push(event);
    },
    platform: "darwin",
    store: {
      read: vi.fn(async () => ({ enabled })),
      update: vi.fn(async (settings) => {
        enabled = settings.enabled;
      }),
    },
  });
  return {
    cleanup: () => rm(tempRoot, { force: true, recursive: true }),
    emit: (event: Parameters<LocalMacOSVoiceListenerEventHandler>[0]) => {
      if (!listener) {
        throw new Error("listener event handler was not registered");
      }
      listener(event);
    },
    events,
    helper,
    service,
    setHealth: (nextHealth: LocalMacOSVoiceHealth) => {
      health = nextHealth;
    },
    wakeModelPath,
  };
}
