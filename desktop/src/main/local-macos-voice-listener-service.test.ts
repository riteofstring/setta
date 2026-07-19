import { createHash } from "node:crypto";
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
          wakeModelSHA256: harness.wakeModelSHA256,
        }),
        expect.any(Function),
      );
    } finally {
      await harness.cleanup();
    }
  });

  test("strips the leading Hey Setta wake phrase from finalized wake transcripts", async () => {
    const harness = await createHarness();
    try {
      await harness.service.updateSettings(true);
      harness.emit({ type: "listener_armed" });
      harness.emit({ score: 0.74, timeMs: 960, type: "wake_detected" });
      harness.emit({ timeMs: 1_140, type: "message_speech_started" });
      harness.emit({ timeMs: 2_220, type: "candidate_endpoint_detected" });
      harness.emit({
        transcript: "  Hey, Setta: open the release checklist  ",
        type: "utterance_finalized",
      });

      await vi.waitFor(() =>
        expect(harness.events.some((event) => event.type === "wake_transcript")).toBe(true),
      );
      const wake = harness.events.find((event) => event.type === "wake_transcript");
      expect(wake).toMatchObject({
        settings: { state: { status: "submitting", transcript: "open the release checklist" } },
        transcript: "open the release checklist",
        type: "wake_transcript",
      });
    } finally {
      await harness.cleanup();
    }
  });

  test("keeps finalized wake transcripts that do not start with the exact wake phrase", async () => {
    const harness = await createHarness();
    try {
      await harness.service.updateSettings(true);
      harness.emit({ type: "listener_armed" });
      harness.emit({ score: 0.74, timeMs: 960, type: "wake_detected" });
      harness.emit({ timeMs: 1_140, type: "message_speech_started" });
      harness.emit({ timeMs: 2_220, type: "candidate_endpoint_detected" });
      harness.emit({
        transcript: "Hey setter, open the release checklist",
        type: "utterance_finalized",
      });

      await vi.waitFor(() =>
        expect(harness.events.some((event) => event.type === "wake_transcript")).toBe(true),
      );
      const wake = harness.events.find((event) => event.type === "wake_transcript");
      expect(wake).toMatchObject({
        settings: {
          state: {
            status: "submitting",
            transcript: "Hey setter, open the release checklist",
          },
        },
        transcript: "Hey setter, open the release checklist",
        type: "wake_transcript",
      });
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

  test("pauses and resumes an armed listener around app speech playback", async () => {
    const harness = await createHarness();
    try {
      await harness.service.updateSettings(true);
      harness.emit({ type: "listener_armed" });
      await vi.waitFor(() =>
        expect(harness.events.at(-1)?.settings.state).toEqual({ status: "armed" }),
      );

      const paused = await harness.service.startPlayback("speech_playback_1");

      expect(paused.state).toMatchObject({
        operationId: "speech_playback_1",
        status: "paused_for_playback",
      });
      expect(harness.helper.pauseListener).toHaveBeenCalledWith({ reason: "playback" });

      const resumed = await harness.service.finishPlayback("speech_playback_1");

      expect(resumed.state).toEqual({ status: "armed" });
      expect(harness.helper.resumeListener).toHaveBeenCalledWith({ reason: "playback" });
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

  test("records microphone denial explicitly and restarts after readiness recovers", async () => {
    const harness = await createHarness({
      initialHealth: {
        message: "Microphone access is denied for Setta.",
        provider: "local_macos",
        status: "microphone_denied",
      },
    });
    try {
      const enabled = await harness.service.updateSettings(true);

      expect(enabled).toEqual({
        availability: {
          message: "Microphone access is denied for Setta.",
          setupAction: null,
          status: "unavailable",
        },
        enabled: true,
        state: {
          message: "Microphone access is denied for Setta.",
          status: "microphone_denied",
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
    } finally {
      await harness.cleanup();
    }
  });

  test("restarts the listener after a runtime engine failure when readiness is healthy", async () => {
    const harness = await createHarness();
    try {
      await harness.service.updateSettings(true);
      harness.emit({ type: "listener_armed" });
      await vi.waitFor(() =>
        expect(harness.events.at(-1)?.settings.state).toEqual({ status: "armed" }),
      );

      harness.emit({ message: "Always listening helper exited.", type: "engine_failed" });
      await vi.waitFor(() =>
        expect(harness.events.at(-1)?.settings.state).toEqual({
          message: "Always listening helper exited.",
          status: "engine_failed",
        }),
      );

      const refreshed = await harness.service.refreshReadiness();

      expect(refreshed).toMatchObject({
        availability: { status: "ready" },
        enabled: true,
        state: { status: "arming" },
      });
      expect(harness.helper.startListener).toHaveBeenCalledTimes(2);
    } finally {
      await harness.cleanup();
    }
  });

  test("prioritizes the local voice setup path before missing wake resources", async () => {
    const harness = await createHarness({
      configuredWakeModelPath: null,
      initialHealth: {
        message: "The local macOS voice model has not been downloaded.",
        modelPath: "/tmp/ggml-base.en.bin",
        provider: "local_macos",
        status: "missing_model",
      },
      wakeModelSHA256: null,
      wakeRuntime: null,
    });
    try {
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
      expect(harness.helper.readHealth).toHaveBeenCalledOnce();
      expect(harness.helper.startListener).not.toHaveBeenCalled();
    } finally {
      await harness.cleanup();
    }
  });

  test("keeps settings unavailable when the packaged wake model hash mismatches", async () => {
    const harness = await createHarness({ wakeModelSHA256: "0".repeat(64) });
    try {
      const enabled = await harness.service.updateSettings(true);

      expect(enabled).toEqual({
        availability: {
          message: "The packaged Hey Setta wake model hash does not match Setta's expected model.",
          setupAction: null,
          status: "unavailable",
        },
        enabled: true,
        state: {
          message: "The packaged Hey Setta wake model hash does not match Setta's expected model.",
          status: "local_voice_not_ready",
        },
      });
      expect(harness.helper.readHealth).toHaveBeenCalledOnce();
      expect(harness.helper.startListener).not.toHaveBeenCalled();
    } finally {
      await harness.cleanup();
    }
  });
});

async function createHarness({
  configuredWakeModelPath,
  initialHealth = {
    helperPath: "/tmp/setta-local-helper",
    modelPath: "/tmp/ggml-base.en.bin",
    modelSHA256: "b".repeat(64),
    provider: "local_macos" as const,
    status: "ready" as const,
  },
  wakeModelSHA256,
  wakeRuntime = "onnx",
}: {
  configuredWakeModelPath?: string | null;
  initialHealth?: LocalMacOSVoiceHealth;
  wakeModelSHA256?: string | null;
  wakeRuntime?: "onnx" | "tflite" | null;
} = {}) {
  const tempRoot = await mkdtemp(join(tmpdir(), "setta-listener-service-"));
  const wakeModelPath = join(tempRoot, "hey-setta.onnx");
  const wakeModelBytes = "wake-model";
  await writeFile(wakeModelPath, wakeModelBytes);
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
      wakeModelPath:
        configuredWakeModelPath === undefined ? wakeModelPath : configuredWakeModelPath,
      wakeModelSHA256: wakeModelSHA256 === undefined ? sha256(wakeModelBytes) : wakeModelSHA256,
      wakeRuntime,
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
    wakeModelSHA256: wakeModelSHA256 ?? sha256(wakeModelBytes),
  };
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}
