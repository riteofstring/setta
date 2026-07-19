import type {
  ConversationEvent,
  ConversationPresentationProfile,
  ConversationSnapshot,
} from "@generated/backend";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  enqueueConversationProjectionEvent,
  resetConversationProjectionRuntime,
} from "../../stores/conversation-projection-runtime";
import { useConversationStore } from "../../stores/conversation-store";
import { AppShellSpeechPlaybackController } from "./app-shell-speech-playback-controller";
import {
  AppShellSpeechPlaybackEffectLifetime,
  handlePlaybackConversationEvent,
} from "./app-shell-speech-playback";

describe("app-shell speech playback provider", () => {
  beforeEach(() => {
    resetConversationProjectionRuntime();
    useConversationStore.getState().reset();
  });

  afterEach(() => {
    resetConversationProjectionRuntime();
    Reflect.deleteProperty(globalThis, "window");
  });

  test("turns status replies and speech-worthy progress highlights into automatic playback intents", () => {
    const controller = playbackController();
    const enqueue = vi.spyOn(controller, "enqueueAutomatic");
    useConversationStore.setState({
      conversations: new Map([
        [
          "conversation-playback",
          {
            conversationId: "conversation-playback",
            error: null,
            resync: null,
            snapshot: {
              eventCursor: {
                sequence: 0,
                streamId: "conversation:conversation-playback",
              },
              presentationProfile: profile(),
              turns: {
                hasEarlier: false,
                turns: [{ id: "turn-playback", status: "completed" }],
              },
            } as unknown as ConversationSnapshot,
            status: "ready",
            workspaceId: "workspace-playback",
          },
        ],
      ]),
    });

    handlePlaybackConversationEvent(controller, narrationCreatedEvent());
    handlePlaybackConversationEvent(controller, routineMilestoneEvent());
    handlePlaybackConversationEvent(controller, finalNarrationEvent());
    handlePlaybackConversationEvent(controller, routineTextDeltaEvent());
    handlePlaybackConversationEvent(controller, trajectoryAppendedEvent());
    handlePlaybackConversationEvent(controller, {
      ...narrationCreatedEvent(),
      payload: { type: "conversation.queue.updated", queue: [] },
    });

    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(enqueue).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        kind: "status_reply",
        source: {
          conversationId: "conversation-playback",
          eventId: "narration-live",
          kind: "narration_event",
          speaker: "narrator",
        },
        sourceCreatedAt: "2026-07-12T18:00:00Z",
      }),
    );
    expect(enqueue).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        kind: "progress_highlight",
        source: {
          conversationId: "conversation-playback",
          eventId: "trajectory-turn-started",
          kind: "progress_highlight",
          speaker: "narrator",
        },
        sourceCreatedAt: "2026-07-12T18:00:01Z",
      }),
    );
  });

  test("uses queued presentation profile before a batched progress highlight event", () => {
    installStalledFrameScheduler();
    const controller = playbackController();
    const enqueue = vi.spyOn(controller, "enqueueAutomatic");
    useConversationStore.setState({
      conversations: new Map([
        [
          "conversation-playback",
          {
            conversationId: "conversation-playback",
            error: null,
            resync: null,
            snapshot: {
              eventCursor: {
                sequence: 0,
                streamId: "conversation:conversation-playback",
              },
              presentationProfile: profile({
                narratorSpeechEnabled: false,
                resolvedNarratorVoiceId: "cedar",
              }),
              turns: { hasEarlier: false, turns: [] },
            } as unknown as ConversationSnapshot,
            status: "ready",
            workspaceId: "workspace-playback",
          },
        ],
      ]),
    });
    enqueueConversationProjectionEvent(presentationProfileUpdatedEvent());

    handlePlaybackConversationEvent(controller, trajectoryAppendedEvent());

    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ kind: "progress_highlight" }));
  });

  test("fails specifically when a live speech event has no hydrated profile", () => {
    expect(() =>
      handlePlaybackConversationEvent(playbackController(), narrationCreatedEvent()),
    ).toThrow(
      "live conversation speech event conversation:conversation-playback:1 arrived without its conversation projection",
    );
  });

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

function playbackController(): AppShellSpeechPlaybackController {
  return new AppShellSpeechPlaybackController({
    createAbortController: () => new AbortController(),
    createAudio: () => {
      throw new Error("audio is not used by this provider test");
    },
    createObjectURL: () => "blob:unused",
    decodeBase64: () => new Uint8Array(),
    logPlayback: () => {},
    logSupersession: () => {},
    now: () => Date.parse("2026-07-12T18:00:00Z"),
    revokeObjectURL: () => {},
    synthesize: () => new Promise(() => {}),
  });
}

function narrationCreatedEvent(): ConversationEvent {
  return {
    conversationId: "conversation-playback",
    emittedAt: "2026-07-12T18:00:00Z",
    eventId: "conversation:conversation-playback:1",
    payload: {
      event: {
        conversationId: "conversation-playback",
        createdAt: "2026-07-12T18:00:00Z",
        finalSummary: null,
        id: "narration-live",
        kind: "status_reply",
        milestone: null,
        resolvedInvocation:
          {} as ConversationSnapshot["narration"]["events"][number]["resolvedInvocation"],
        sourceSequenceEnd: 4,
        sourceSequenceStart: 3,
        statusReply: { question: "Status?", text: "Working." },
        streamSequence: 1,
        topicDescriptor: null,
        trigger: "explicit_status_requested",
        turnId: "turn-playback",
      },
      type: "conversation.narration.created",
    },
    schemaVersion: 1,
    sequence: 1,
    streamId: "conversation:conversation-playback",
    workspaceId: "workspace-playback",
  };
}

function routineMilestoneEvent(): ConversationEvent {
  const event = narrationCreatedEvent();
  if (event.payload.type !== "conversation.narration.created") {
    throw new Error("narration fixture must contain a narration event");
  }
  return {
    ...event,
    eventId: "conversation:conversation-playback:2",
    payload: {
      event: {
        ...event.payload.event,
        id: "routine-milestone",
        kind: "milestone",
        milestone: { text: "Routine progress remains visual-only." },
        statusReply: null,
        trigger: "plan_changed",
      },
      type: "conversation.narration.created",
    },
    sequence: 3,
  };
}

function presentationProfileUpdatedEvent(): ConversationEvent {
  return {
    conversationId: "conversation-playback",
    emittedAt: "2026-07-12T18:00:00Z",
    eventId: "conversation:conversation-playback:1",
    payload: {
      profile: profile(),
      type: "conversation.presentation_profile.updated",
    },
    schemaVersion: 1,
    sequence: 1,
    streamId: "conversation:conversation-playback",
    workspaceId: "workspace-playback",
  };
}

function trajectoryAppendedEvent(): ConversationEvent {
  return {
    conversationId: "conversation-playback",
    emittedAt: "2026-07-12T18:00:01Z",
    eventId: "conversation:conversation-playback:4",
    payload: {
      event: {
        actor: "agent",
        activityCompleted: null,
        activityFailed: null,
        activityProgressed: null,
        activityStarted: null,
        agentLivenessChanged: null,
        agentMessageCompleted: null,
        agentPublicTextDelta: null,
        approvalRequested: null,
        approvalResolved: null,
        artifactEmitted: null,
        conversationId: "conversation-playback",
        emittedAt: "2026-07-12T18:00:01Z",
        fileChangeCompleted: null,
        fileChangeProposed: null,
        id: "trajectory-turn-started",
        kind: "turn_started",
        modelRerouted: null,
        planChanged: null,
        providerEventId: null,
        providerLifecycleChanged: null,
        providerThreadId: null,
        providerTurnId: null,
        publicReasoningSummaryUpdated: null,
        sequence: 4,
        subagentCompleted: null,
        subagentStarted: null,
        subagentUpdated: null,
        turnCompleted: null,
        turnFailed: null,
        turnId: "turn-playback",
        turnInterrupted: null,
        turnPromoted: null,
        turnQueued: null,
        turnStarted: {
          invocation: {} as NonNullable<
            ConversationSnapshot["turns"]["turns"][number]["resolvedInvocation"]
          >,
        },
        turnSteered: null,
        userInputAccepted: null,
      },
      type: "conversation.trajectory.appended",
    },
    schemaVersion: 1,
    sequence: 4,
    streamId: "conversation:conversation-playback",
    workspaceId: "workspace-playback",
  };
}

function routineTextDeltaEvent(): ConversationEvent {
  const event = trajectoryAppendedEvent();
  if (event.payload.type !== "conversation.trajectory.appended") {
    throw new Error("trajectory fixture must contain a trajectory event");
  }
  return {
    ...event,
    eventId: "conversation:conversation-playback:5",
    payload: {
      event: {
        ...event.payload.event,
        agentPublicTextDelta: { delta: "Routine text", providerItemId: "provider-text" },
        id: "trajectory-text-delta",
        kind: "agent_public_text_delta",
        turnStarted: null,
      },
      type: "conversation.trajectory.appended",
    },
    sequence: 5,
  };
}

function finalNarrationEvent(): ConversationEvent {
  const event = narrationCreatedEvent();
  if (event.payload.type !== "conversation.narration.created") {
    throw new Error("narration fixture must contain a narration event");
  }
  return {
    ...event,
    eventId: "conversation:conversation-playback:3",
    payload: {
      event: {
        ...event.payload.event,
        finalSummary: { text: "The topic reached a terminal state." },
        kind: "final_summary",
        statusReply: null,
      },
      type: "conversation.narration.created",
    },
    sequence: 2,
  };
}

function installStalledFrameScheduler(): void {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      cancelAnimationFrame: vi.fn(),
      clearTimeout: vi.fn(),
      requestAnimationFrame: vi.fn(() => 1),
      setTimeout: vi.fn(() => 1),
    },
  });
}

function profile(
  overrides: Partial<ConversationPresentationProfile> = {},
): ConversationPresentationProfile {
  return {
    conversationId: "conversation-playback",
    narratorSpeechEnabled: true,
    narratorVoiceReuse: null,
    narratorVoiceSelection: "auto_distinct",
    paletteReuse: null,
    paletteSelection: "auto_distinct",
    requestedNarratorVoiceId: null,
    requestedPaletteId: null,
    resolvedNarratorVoiceId: "cedar",
    resolvedPaletteId: "violet",
    updatedAt: "2026-07-12T18:00:00Z",
    ...overrides,
  };
}

function drain(scheduled: Array<() => void>): void {
  for (const handler of scheduled.splice(0)) {
    handler();
  }
}
