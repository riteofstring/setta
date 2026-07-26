import type { DirectorIntent, DirectorReceipt, SpeechCapabilities } from "@generated/backend";
import { describe, expect, test, vi } from "vitest";

import {
  DirectorSpeechCaptureController,
  type DirectorSpeechCaptureControllerDependencies,
} from "./director-speech-capture";
import type {
  SpeechCaptureSupport,
  VoiceCaptureSession,
  VoiceCaptureSessionEvent,
  VoiceInputProvider,
} from "../global-speech/voice-provider-boundary";

describe("Director speech capture controller", () => {
  test("submits a completed transcript through a Director voice intent", async () => {
    const harness = createHarness();
    await harness.controller.synchronizeRuntime("runtime-alpha");
    await harness.controller.start();

    harness.session.emit({
      captureSessionId: "capture-1",
      delta: "Find",
      transcript: "Find the failing workflow",
      type: "transcript_delta",
    });
    harness.controller.commit();
    await flushPromises();
    harness.session.emit({
      captureSessionId: "capture-1",
      transcript: "Find the failing workflow",
      type: "transcript_completed",
    });
    await flushPromises();

    expect(harness.dispatch).toHaveBeenCalledWith({
      cancelRun: null,
      createWorkstream: null,
      kind: "submit",
      moveSelection: null,
      resolveApproval: null,
      resolveResourceRequest: null,
      selectWorkstream: null,
      submit: { modality: "voice", text: "Find the failing workflow" },
    });
    expect(harness.controller.getSnapshot().capture).toMatchObject({
      receiptText: "Started.",
      transcript: "Find the failing workflow",
      type: "submitted",
    });
    expect(harness.onCaptureStart).toHaveBeenCalledOnce();
    expect(harness.onCaptureEnd).toHaveBeenCalledOnce();
  });

  test("keeps the finalized transcript retryable when Director dispatch fails", async () => {
    const harness = createHarness({
      dispatch: vi
        .fn()
        .mockRejectedValueOnce(new Error("offline"))
        .mockResolvedValueOnce(receipt("Retried.")),
    });
    await harness.controller.synchronizeRuntime("runtime-alpha");
    await harness.controller.start();
    harness.controller.commit();
    await flushPromises();
    harness.session.emit({
      captureSessionId: "capture-1",
      transcript: "Retry this exact request",
      type: "transcript_completed",
    });
    await flushPromises();

    expect(harness.controller.getSnapshot().capture).toMatchObject({
      code: "director_submission_failed",
      retryTranscript: {
        captureSessionId: "capture-1",
        runtimeId: "runtime-alpha",
        transcript: "Retry this exact request",
      },
      type: "failed",
    });

    harness.controller.retrySubmission();
    await flushPromises();

    expect(harness.dispatch).toHaveBeenCalledTimes(2);
    expect(harness.dispatch.mock.calls[1]?.[0]).toMatchObject({
      kind: "submit",
      submit: { modality: "voice", text: "Retry this exact request" },
    });
    expect(harness.controller.getSnapshot().capture).toMatchObject({
      receiptText: "Retried.",
      type: "submitted",
    });
  });

  test("cancels active capture and ignores late transcripts after a runtime change", async () => {
    const harness = createHarness();
    await harness.controller.synchronizeRuntime("runtime-alpha");
    await harness.controller.start();
    await harness.controller.synchronizeRuntime("runtime-beta");

    harness.session.emit({
      captureSessionId: "capture-1",
      transcript: "stale words",
      type: "transcript_completed",
    });
    await flushPromises();

    expect(harness.session.cancel).toHaveBeenCalledOnce();
    expect(harness.dispatch).not.toHaveBeenCalled();
    expect(harness.controller.getSnapshot()).toMatchObject({
      capture: { type: "idle" },
      runtimeId: "runtime-beta",
    });
  });
});

function createHarness(
  overrides: Partial<{
    dispatch: (intent: DirectorIntent) => Promise<DirectorReceipt>;
  }> = {},
) {
  const session = new FakeVoiceCaptureSession();
  const dispatch = vi.fn(overrides.dispatch ?? (async () => receipt("Started.")));
  const onCaptureEnd = vi.fn();
  const onCaptureStart = vi.fn();
  const dependencies: DirectorSpeechCaptureControllerDependencies = {
    captureProvider: new FakeVoiceInputProvider(session),
    clearTimeout: vi.fn(),
    createCaptureSessionId: () => "capture-1",
    dispatchDirectorIntent: dispatch,
    onCaptureEnd,
    onCaptureStart,
    setTimeout: vi.fn(() => "timer"),
  };
  return {
    controller: new DirectorSpeechCaptureController(dependencies),
    dispatch,
    onCaptureEnd,
    onCaptureStart,
    session,
  };
}

class FakeVoiceInputProvider implements VoiceInputProvider {
  readonly id = "openai" as const;

  constructor(private readonly session: FakeVoiceCaptureSession) {}

  readCapabilities = async (): Promise<SpeechCapabilities> => capabilities();

  readSupport = (): SpeechCaptureSupport => ({ supported: true });

  startCapture = async (): Promise<VoiceCaptureSession> => this.session;
}

class FakeVoiceCaptureSession implements VoiceCaptureSession {
  readonly cancel = vi.fn();
  readonly finish = vi.fn(async () => {});
  readonly ready = Promise.resolve();
  private readonly listeners = new Set<(event: VoiceCaptureSessionEvent) => void>();

  emit(event: VoiceCaptureSessionEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  subscribe(listener: (event: VoiceCaptureSessionEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

function capabilities(): SpeechCapabilities {
  return {
    aiVoiceDisclosure: "AI-generated voice.",
    maximumRecordingSeconds: 30,
    maximumSynthesisCharacters: 4000,
    maximumTranscriptCharacters: 4000,
    providerStatus: "configured",
    synthesisModel: "test-synthesis",
    transcriptionModel: "test-transcription",
    voiceCatalog: {
      provider: "openai",
      version: "test",
      voiceIds: ["marin"],
    },
  };
}

function receipt(replyText: string): DirectorReceipt {
  return {
    kind: "submit",
    selectedWorkstreamId: "workstream-alpha",
    submit: {
      intentId: "intent-alpha",
      replyText,
      toolCalls: [],
    },
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
