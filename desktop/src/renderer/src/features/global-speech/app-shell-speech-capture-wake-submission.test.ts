import type {
  SpeechCapabilities,
  ShellInteractionState,
  SubmitConversationInputRequest,
  SubmitMasterInputRequest,
} from "@generated/backend";
import { describe, expect, test } from "vitest";

import { AppShellMasterController } from "../global-master/app-shell-master-controller";
import {
  AppShellSpeechCaptureController,
  type AppShellSpeechCaptureControllerDependencies,
} from "./app-shell-speech-capture-controller";
import type { VoiceInputProvider } from "./voice-provider-boundary";

describe("app-shell speech capture wake submission", () => {
  test("blocks a global wake transcript while the master interaction is busy", async () => {
    const harness = createWakeHarness({
      readActiveInteraction: async () => ({ state: masterRoutingState() }),
    });
    await harness.connect();

    harness.controller.submitWakeTranscript("wake_busy", "continue the current work");
    await flushPromises();

    expect(harness.masterInputRequests).toEqual([]);
    expect(harness.currentCapture()).toEqual({
      code: "master_submission_pending",
      message: "The active master request must settle before another voice request can start.",
      type: "failed",
    });
    expect(harness.completedWakeSubmissions).toEqual(["wake_busy"]);
  });

  test("clears stale capture failures before submitting a wake transcript", async () => {
    const harness = createWakeHarness();
    await harness.connect();

    harness.controller.submitWakeTranscript("wake_empty", "  ");
    await flushPromises();
    expect(harness.currentCapture()).toMatchObject({
      code: "no_speech",
      type: "failed",
    });

    harness.controller.submitWakeTranscript("wake_recovered", "Recovered wake request.");
    await flushPromises();

    expect(harness.currentCapture()).toEqual({ type: "idle" });
    expect(harness.masterInputRequests).toHaveLength(1);
    expect(harness.masterInputRequests[0]?.input.id).toBe("wake_recovered");
    expect(harness.completedWakeSubmissions).toEqual(["wake_empty", "wake_recovered"]);
  });
});

interface WakeHarnessOptions {
  readActiveInteraction?: () => Promise<{ state: ShellInteractionState | null }>;
}

function createWakeHarness(options: WakeHarnessOptions = {}) {
  const completedWakeSubmissions: string[] = [];
  const conversationInputRequests: SubmitConversationInputRequest[] = [];
  const masterInputRequests: SubmitMasterInputRequest[] = [];
  const now = () => new Date("2026-07-12T18:00:00Z");
  const dependencies: AppShellSpeechCaptureControllerDependencies = {
    captureProvider: fakeCaptureProvider(),
    clearTimeout: () => {},
    completeWakeTranscriptSubmission: async (captureSessionId) => {
      completedWakeSubmissions.push(captureSessionId);
    },
    createCaptureSessionId: () => "unused_capture",
    now,
    onCaptureEnd: () => {},
    onCaptureStart: () => {},
    setTimeout: () => Symbol("timer"),
    settleConversationInput: async () => {},
    submitConversationInput: async (request) => {
      conversationInputRequests.push(request);
      return {
        acceptedAt: "2026-07-12T18:00:01Z",
        input: request.input,
        sequence: 1,
        status: "accepted",
      };
    },
  };
  const masterController = new AppShellMasterController({
    cancelMasterInput: async () => {
      throw new Error("the wake submission test route is not cancellable");
    },
    createInputId: () => "unused_text_input",
    now,
    presentPresentationIntent: async () => ({ paneId: "pane_capture" }),
    readActiveInteraction: options.readActiveInteraction ?? (async () => ({ state: null })),
    readFocusHints: () => ({
      focusedConversationId: null,
      focusedPaneId: null,
      focusedWorkspaceId: "workspace_capture",
    }),
    resolvePresentationIntent: async (request) => ({
      ...request,
      resolvedAt: "2026-07-12T18:00:02Z",
    }),
    submitMasterInput: async (request) => {
      masterInputRequests.push(request);
      return {
        acceptedAt: "2026-07-12T18:00:01Z",
        input: request.input,
        replyDelivery: {
          originatingConversationId: null,
          originatingConversationInputId: null,
          originatingPaneId: null,
          originatingWorkspaceId: null,
        },
        sequence: 1,
      };
    },
    waitPresentationIntent: async () => {
      throw new Error("failed master inputs do not produce presentation intents");
    },
    waitShellInteraction: async ({ inputId }) => {
      const request = masterInputRequests.find((submitted) => submitted.input.id === inputId);
      if (!request) {
        throw new Error(`submitted master input ${inputId} is unavailable`);
      }
      return {
        decision: null,
        failure: {
          code: "test_terminal",
          message: "Test route settled.",
          retryable: false,
        },
        input: request.input,
        status: "failed",
      };
    },
  });
  const controller = new AppShellSpeechCaptureController(dependencies, masterController);
  return {
    completedWakeSubmissions,
    connect: async () => {
      await controller.synchronizeRuntime("runtime_wake");
      await flushPromises();
    },
    controller,
    conversationInputRequests,
    currentCapture: () => controller.getSnapshot().capture,
    masterInputRequests,
  };
}

function fakeCaptureProvider(): VoiceInputProvider {
  return {
    id: "openai",
    readCapabilities: async () => capabilities(),
    readSupport: () => ({ supported: true }),
    startCapture: async () => {
      throw new Error("wake submission tests do not start microphone capture");
    },
  };
}

function capabilities(): SpeechCapabilities {
  return {
    aiVoiceDisclosure: "Voice is AI-generated.",
    maximumRecordingSeconds: 120,
    maximumSynthesisCharacters: 4096,
    maximumTranscriptCharacters: 8000,
    providerStatus: "configured",
    synthesisModel: "gpt-4o-mini-tts",
    transcriptionModel: "gpt-realtime-whisper",
    voiceCatalog: {
      provider: "openai",
      version: "test",
      voiceIds: ["marin", "cedar"],
    },
  };
}

function masterRoutingState(): ShellInteractionState {
  return {
    decision: null,
    failure: null,
    input: {
      focusedConversationId: null,
      focusedPaneId: null,
      focusedWorkspaceId: "workspace_capture",
      id: "busy_master_input",
      modality: "text",
      originatingConversationId: null,
      originatingConversationInputId: null,
      originatingPaneId: null,
      originatingWorkspaceId: null,
      source: "shell",
      submittedAt: "2026-07-12T17:59:00Z",
      text: "Busy master input",
    },
    status: "routing",
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
