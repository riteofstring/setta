import type {
  ConversationPresentationProfile,
  NarrationEvent,
  SpeechAudio,
  SpeechSynthesisRequest,
} from "@generated/backend";
import { describe, expect, test, vi } from "vitest";

import {
  AppShellSpeechPlaybackController,
  narrationSpeechPlaybackIntent,
  speechPlaybackPriority,
  type NarratorSpeechPlaybackIntent,
  type SpeechPlaybackControllerDependencies,
  type SpeechPlaybackSupersessionDecision,
} from "./app-shell-speech-playback-controller";

describe("app-shell speech playback controller", () => {
  test("derives source-aware priorities from live narration and ignores non-speech channels", () => {
    expect(
      narrationSpeechPlaybackIntent(narrationEvent("status_reply", "status"), profile(), null),
    ).toMatchObject({ kind: "status_reply", resolvedVoiceId: "cedar" });
    expect(
      narrationSpeechPlaybackIntent(
        narrationEvent("milestone", "approval", { trigger: "approval_required" }),
        profile(),
        "running",
      ),
    ).toMatchObject({ kind: "attention" });
    expect(
      narrationSpeechPlaybackIntent(
        narrationEvent("final_summary", "final"),
        profile(),
        "completed",
      ),
    ).toMatchObject({ kind: "final_summary" });
    expect(
      narrationSpeechPlaybackIntent(narrationEvent("final_summary", "failed"), profile(), "failed"),
    ).toMatchObject({ kind: "error" });
    expect(
      narrationSpeechPlaybackIntent(narrationEvent("milestone", "milestone"), profile(), "running"),
    ).toMatchObject({
      kind: "milestone",
      source: {
        conversationId: "conversation-playback",
        eventId: "milestone",
        speaker: "narrator",
      },
    });
    expect(
      narrationSpeechPlaybackIntent(
        narrationEvent("topic_descriptor", "descriptor"),
        profile(),
        "running",
      ),
    ).toBeNull();
    expect(
      narrationSpeechPlaybackIntent(
        narrationEvent("milestone", "disabled"),
        profile({ narratorSpeechEnabled: false, resolvedNarratorVoiceId: null }),
        "running",
      ),
    ).toBeNull();
    expect([
      speechPlaybackPriority("master_answer"),
      speechPlaybackPriority("status_reply"),
      speechPlaybackPriority("attention"),
      speechPlaybackPriority("error"),
      speechPlaybackPriority("final_summary"),
      speechPlaybackPriority("milestone"),
    ]).toEqual([4, 4, 3, 3, 2, 1]);
  });

  test("orders one queue by priority and FIFO within a priority across conversations", async () => {
    const harness = createHarness();
    const speaking = intent("milestone", "speaking", { conversationId: "conversation-a" });
    const queuedMilestone = intent("milestone", "queued", {
      conversationId: "conversation-b",
    });
    const final = intent("final_summary", "final", {
      conversationId: "conversation-c",
      turnId: "turn-final",
    });
    const directFirst = intent("status_reply", "direct-first", {
      conversationId: "conversation-a",
    });
    const directSecond = intent("status_reply", "direct-second", {
      conversationId: "conversation-b",
    });

    harness.controller.enqueueAutomatic(speaking);
    harness.resolveSynthesis(0);
    await flushPromises();
    harness.controller.enqueueAutomatic(queuedMilestone);
    harness.controller.enqueueAutomatic(final);
    harness.controller.enqueueAutomatic(directFirst);
    harness.controller.enqueueAutomatic(directSecond);

    expect(harness.snapshot().state).toEqual({ intent: speaking, type: "speaking" });
    expect(harness.snapshot().queued.map((queued) => queued.source.eventId)).toEqual([
      "direct-first",
      "direct-second",
      "final",
      "queued",
    ]);

    harness.audios[0]!.emit("ended");
    expect(harness.requests.at(-1)?.source.eventId).toBe("direct-first");
    harness.resolveSynthesis(1);
    await flushPromises();
    harness.audios[1]!.emit("ended");
    expect(harness.requests.at(-1)?.source.eventId).toBe("direct-second");
  });

  test("a final summary supersedes only covered unplayed milestones from its turn", async () => {
    const harness = createHarness();
    const active = intent("milestone", "active-milestone", {
      sourceSequenceEnd: 8,
      sourceSequenceStart: 7,
    });
    const queued = intent("milestone", "queued-milestone", {
      sourceSequenceEnd: 8,
      sourceSequenceStart: 7,
    });
    const final = intent("final_summary", "covering-final", {
      sourceSequenceEnd: 8,
      sourceSequenceStart: 7,
    });

    harness.controller.enqueueAutomatic(active);
    const activeSignal = harness.signals[0]!;
    harness.controller.enqueueAutomatic(queued);
    harness.controller.enqueueAutomatic(final);

    expect(activeSignal.aborted).toBe(true);
    expect(harness.requests.map((request) => request.source.eventId)).toEqual([
      "active-milestone",
      "covering-final",
    ]);
    expect(harness.supersessions).toEqual([
      expect.objectContaining({
        reason: "final_summary_covers_unplayed_milestone",
        superseded: expect.objectContaining({
          source: expect.objectContaining({ eventId: "queued-milestone" }),
        }),
      }),
      expect.objectContaining({
        superseded: expect.objectContaining({
          source: expect.objectContaining({ eventId: "active-milestone" }),
        }),
      }),
    ]);

    harness.resolveSynthesis(0);
    await flushPromises();
    expect(harness.audios).toEqual([]);
    harness.resolveSynthesis(1);
    await flushPromises();
    expect(harness.snapshot().state).toEqual({ intent: final, type: "speaking" });
  });

  test("does not supersede a speaking milestone or output from another turn or conversation", async () => {
    const harness = createHarness();
    const speaking = intent("milestone", "speaking-milestone");
    const otherTurn = intent("milestone", "other-turn", { turnId: "turn-other" });
    const otherConversation = intent("milestone", "other-conversation", {
      conversationId: "conversation-other",
    });
    const final = intent("final_summary", "final");

    harness.controller.enqueueAutomatic(speaking);
    harness.resolveSynthesis(0);
    await flushPromises();
    harness.controller.enqueueAutomatic(otherTurn);
    harness.controller.enqueueAutomatic(otherConversation);
    harness.controller.enqueueAutomatic(final);

    expect(harness.snapshot().state).toEqual({ intent: speaking, type: "speaking" });
    expect(harness.snapshot().queued.map((queued) => queued.source.eventId)).toEqual([
      "final",
      "other-turn",
      "other-conversation",
    ]);
    expect(harness.supersessions).toEqual([]);
  });

  test("preempts lower-priority synthesis without dropping it", () => {
    const harness = createHarness();
    const milestone = intent("milestone", "low-priority");
    const direct = intent("status_reply", "direct-priority");

    harness.controller.enqueueAutomatic(milestone);
    const milestoneSignal = harness.signals[0]!;
    harness.controller.enqueueAutomatic(direct);

    expect(milestoneSignal.aborted).toBe(true);
    expect(harness.requests.map((request) => request.source.eventId)).toEqual([
      "low-priority",
      "direct-priority",
    ]);
    expect(harness.snapshot().queued).toEqual([milestone]);
  });

  test("capture preemption aborts synthesis, stops audio, and clears every queued source", async () => {
    const synthesizing = createHarness();
    synthesizing.controller.enqueueAutomatic(intent("milestone", "synthesizing"));
    synthesizing.controller.enqueueAutomatic(intent("status_reply", "queued-direct"));
    const activeSignal = synthesizing.signals.at(-1)!;

    synthesizing.controller.preemptForCapture();

    expect(activeSignal.aborted).toBe(true);
    expect(synthesizing.snapshot()).toMatchObject({
      queued: [],
      state: { reason: "capture", type: "stopped" },
    });

    const speaking = createHarness();
    speaking.controller.enqueueAutomatic(intent("status_reply", "speaking"));
    speaking.resolveSynthesis(0);
    await flushPromises();
    const audio = speaking.audios[0]!;
    audio.currentTime = 4;

    speaking.controller.preemptForCapture();

    expect(audio.pause).toHaveBeenCalledOnce();
    expect(audio.currentTime).toBe(0);
    expect(speaking.snapshot().state).toMatchObject({ reason: "capture", type: "stopped" });
  });

  test("validates source attribution and reuses bounded cached audio for replay", async () => {
    const harness = createHarness();
    const source = intent("status_reply", "cached-source");
    harness.controller.enqueueAutomatic(source);
    harness.resolveSynthesis(0);
    await flushPromises();
    harness.audios[0]!.emit("ended");

    harness.controller.replay(source);
    await flushPromises();

    expect(harness.requests).toHaveLength(1);
    expect(harness.audios.map((audio) => audio.url)).toEqual(["blob:speech-1", "blob:speech-1"]);

    const invalid = createHarness({
      response: (request) => ({
        ...speechAudio(request),
        source: { ...request.source, eventId: "wrong-event" },
      }),
    });
    invalid.controller.enqueueAutomatic(intent("status_reply", "expected-event"));
    invalid.resolveSynthesis(0);
    await flushPromises();
    expect(invalid.snapshot().state).toMatchObject({
      message: "The runtime returned invalid synthesized audio.",
      type: "failed",
    });
  });

  test("runtime changes revoke cached URLs and reject stale synthesis responses", async () => {
    const harness = createHarness();
    harness.controller.synchronizeRuntime("runtime-a");
    const source = intent("status_reply", "runtime-source");
    harness.controller.enqueueAutomatic(source);
    harness.resolveSynthesis(0);
    await flushPromises();
    harness.audios[0]!.emit("ended");

    harness.controller.synchronizeRuntime("runtime-b");

    expect(harness.revokedURLs).toEqual(["blob:speech-1"]);
    expect(harness.snapshot()).toEqual({ queued: [], state: { type: "idle" } });
  });
});

class FakeAudio {
  currentTime = 0;
  readonly listeners = {
    ended: new Set<() => void>(),
    error: new Set<() => void>(),
  };
  readonly pause = vi.fn();
  readonly play = vi.fn(async () => {});

  constructor(readonly url: string) {}

  addEventListener(type: "ended" | "error", listener: () => void): void {
    this.listeners[type].add(listener);
  }

  removeEventListener(type: "ended" | "error", listener: () => void): void {
    this.listeners[type].delete(listener);
  }

  emit(type: "ended" | "error"): void {
    for (const listener of this.listeners[type]) {
      listener();
    }
  }
}

function createHarness(
  options: {
    response?: (request: SpeechSynthesisRequest) => SpeechAudio;
  } = {},
) {
  const requests: SpeechSynthesisRequest[] = [];
  const signals: AbortSignal[] = [];
  const results: Array<Deferred<SpeechAudio>> = [];
  const audios: FakeAudio[] = [];
  const supersessions: SpeechPlaybackSupersessionDecision[] = [];
  const revokedURLs: string[] = [];
  const dependencies: SpeechPlaybackControllerDependencies = {
    createAbortController: () => new AbortController(),
    createAudio: (url) => {
      const audio = new FakeAudio(url);
      audios.push(audio);
      return audio;
    },
    createObjectURL: () => `blob:speech-${audios.length + 1}`,
    decodeBase64: () => new Uint8Array([82, 73, 70, 70]),
    logSupersession: (decision) => supersessions.push(decision),
    revokeObjectURL: (url) => revokedURLs.push(url),
    synthesize: (request, signal) => {
      requests.push(request);
      signals.push(signal);
      const result = deferred<SpeechAudio>();
      results.push(result);
      return result.promise;
    },
  };
  const controller = new AppShellSpeechPlaybackController(dependencies);
  return {
    audios,
    controller,
    requests,
    resolveSynthesis: (index: number) => {
      const request = requests[index];
      if (!request) {
        throw new Error(`missing synthesis request ${index}`);
      }
      results[index]!.resolve((options.response ?? speechAudio)(request));
    },
    revokedURLs,
    signals,
    snapshot: controller.getSnapshot,
    supersessions,
  };
}

function intent(
  kind: NarratorSpeechPlaybackIntent["kind"],
  eventId: string,
  overrides: IntentOverrides = {},
): NarratorSpeechPlaybackIntent {
  const {
    conversationId = "conversation-playback",
    source: sourceOverrides,
    ...intentOverrides
  } = overrides;
  return {
    kind,
    resolvedVoiceId: "cedar",
    sourceSequenceEnd: 8,
    sourceSequenceStart: 7,
    turnId: "turn-playback",
    ...intentOverrides,
    source: {
      conversationId,
      eventId,
      speaker: "narrator",
      ...sourceOverrides,
    },
  };
}

type IntentOverrides = Omit<Partial<NarratorSpeechPlaybackIntent>, "source"> & {
  conversationId?: string;
  source?: Partial<NarratorSpeechPlaybackIntent["source"]>;
};

function narrationEvent(
  kind: NarrationEvent["kind"],
  id: string,
  overrides: Partial<NarrationEvent> = {},
): NarrationEvent {
  return {
    conversationId: "conversation-playback",
    createdAt: "2026-07-12T18:00:00Z",
    finalSummary: kind === "final_summary" ? { text: "Final" } : null,
    id,
    kind,
    milestone: kind === "milestone" ? { text: "Milestone" } : null,
    resolvedInvocation: {} as NarrationEvent["resolvedInvocation"],
    sourceSequenceEnd: 8,
    sourceSequenceStart: 7,
    statusReply: kind === "status_reply" ? { question: "Status?", text: "Working" } : null,
    streamSequence: 1,
    topicDescriptor: kind === "topic_descriptor" ? { text: "Topic" } : null,
    trigger:
      kind === "status_reply"
        ? "explicit_status_requested"
        : kind === "final_summary"
          ? "turn_terminal"
          : "plan_changed",
    turnId: "turn-playback",
    ...overrides,
  };
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

function speechAudio(request: SpeechSynthesisRequest): SpeechAudio {
  return {
    audioBase64: "UklGRg==",
    format: "wav",
    mediaType: "audio/wav",
    resolvedVoiceId: request.resolvedVoiceId,
    source: { ...request.source },
  };
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
