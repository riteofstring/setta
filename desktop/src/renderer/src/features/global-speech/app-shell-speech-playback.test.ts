import type {
  ConversationEvent,
  ConversationPresentationProfile,
  ConversationSnapshot,
} from "@generated/backend";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useConversationStore } from "../../stores/conversation-store";
import { AppShellSpeechPlaybackController } from "./app-shell-speech-playback-controller";
import {
  AppShellSpeechPlaybackEffectLifetime,
  handlePlaybackConversationEvent,
} from "./app-shell-speech-playback";

describe("app-shell speech playback provider", () => {
  beforeEach(() => useConversationStore.getState().reset());

  test("turns only a live narration event into one automatic playback intent", () => {
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
              presentationProfile: profile(),
              turns: { hasEarlier: false, turns: [] },
            } as unknown as ConversationSnapshot,
            status: "ready",
            workspaceId: "workspace-playback",
          },
        ],
      ]),
    });

    handlePlaybackConversationEvent(controller, narrationCreatedEvent());
    handlePlaybackConversationEvent(controller, {
      ...narrationCreatedEvent(),
      payload: { type: "conversation.queue.updated", queue: [] },
    });

    expect(enqueue).toHaveBeenCalledOnce();
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "status_reply",
        source: {
          conversationId: "conversation-playback",
          eventId: "narration-live",
          speaker: "narrator",
        },
      }),
    );
  });

  test("fails specifically when a live narration stream has no hydrated profile", () => {
    expect(() =>
      handlePlaybackConversationEvent(playbackController(), narrationCreatedEvent()),
    ).toThrow("arrived without its conversation projection");
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
    logSupersession: () => {},
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

function profile(): ConversationPresentationProfile {
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
  };
}

function drain(scheduled: Array<() => void>): void {
  for (const handler of scheduled.splice(0)) {
    handler();
  }
}
