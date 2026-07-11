import type { SpeechAudio } from "@generated/backend";
import { describe, expect, test, vi } from "vitest";

import {
  SpeechPlaybackController,
  type SpeechPlaybackControllerDependencies,
  type SpeechPlaybackState,
  type SpeechSummarySource,
} from "./speech-playback-controller";

describe("Easy Button speech playback controller", () => {
  test("synthesizes a persisted summary ID and plays the returned WAV", async () => {
    const harness = createHarness();
    const source = summarySource("run_a");

    harness.controller.enqueueAutomaticSummary(source);
    expect(harness.currentState()).toEqual({ source, type: "synthesizing" });
    expect(harness.synthesisRequests).toEqual([
      { easyRunId: "run_a", workspaceId: "workspace_playback" },
    ]);

    harness.resolveSynthesis(0, speechAudio("run_a"));
    await flushPromises();
    expect(harness.currentState()).toEqual({ source, type: "speaking" });
    expect(harness.audios).toHaveLength(1);
    expect(harness.audios[0]?.url).toBe("blob:speech-1");
    expect(harness.audios[0]?.play).toHaveBeenCalledOnce();

    harness.audios[0]?.emit("ended");
    expect(harness.currentState()).toEqual({ type: "idle" });
  });

  test("keeps a FIFO queue and deduplicates automatic and pending summaries", async () => {
    const harness = createHarness();
    const sourceA = summarySource("run_a");
    const sourceB = summarySource("run_b");

    harness.controller.enqueueAutomaticSummary(sourceA);
    harness.controller.enqueueAutomaticSummary(sourceA);
    harness.controller.replaySummary(sourceA);
    harness.controller.enqueueAutomaticSummary(sourceB);
    expect(harness.synthesisRequests).toHaveLength(1);

    harness.resolveSynthesis(0, speechAudio("run_a"));
    await flushPromises();
    harness.audios[0]?.emit("ended");
    expect(harness.revokedURLs).toEqual(["blob:speech-1"]);
    expect(harness.synthesisRequests).toEqual([
      { easyRunId: "run_a", workspaceId: "workspace_playback" },
      { easyRunId: "run_b", workspaceId: "workspace_playback" },
    ]);
    expect(harness.currentState()).toEqual({ source: sourceB, type: "synthesizing" });

    harness.resolveSynthesis(1, speechAudio("run_b"));
    await flushPromises();
    expect(harness.revokedURLs).toEqual(["blob:speech-1"]);
    harness.audios[1]?.emit("ended");
    harness.controller.enqueueAutomaticSummary(sourceA);
    harness.controller.enqueueAutomaticSummary(sourceB);
    expect(harness.synthesisRequests).toHaveLength(2);
  });

  test("manual replay reuses the mounted summary Blob without another billable request", async () => {
    const harness = createHarness();
    const source = summarySource("run_replay");

    harness.controller.replaySummary(source);
    harness.resolveSynthesis(0, speechAudio("run_replay"));
    await flushPromises();
    harness.audios[0]?.emit("ended");

    harness.controller.replaySummary(source);
    await flushPromises();
    expect(harness.synthesisRequests).toHaveLength(1);
    expect(harness.audios).toHaveLength(2);
    expect(harness.audios.map((audio) => audio.url)).toEqual(["blob:speech-1", "blob:speech-1"]);
    expect(harness.currentState()).toEqual({ source, type: "speaking" });
  });

  test("stop aborts synthesis and rejects a stale response", async () => {
    const harness = createHarness();
    const source = summarySource("run_abort");

    harness.controller.replaySummary(source);
    const signal = harness.synthesisSignals[0];
    harness.controller.stop();
    expect(signal?.aborted).toBe(true);
    expect(harness.currentState()).toEqual({ source, type: "stopped" });

    harness.resolveSynthesis(0, speechAudio("run_abort"));
    await flushPromises();
    expect(harness.audios).toEqual([]);
    expect(harness.createdURLs).toEqual([]);
    expect(harness.currentState()).toEqual({ source, type: "stopped" });
  });

  test("stop pauses active audio, clears queued work, and preserves the Blob for replay", async () => {
    const harness = createHarness();
    const source = summarySource("run_stop");

    harness.controller.replaySummary(source);
    harness.controller.replaySummary(summarySource("run_queued"));
    harness.resolveSynthesis(0, speechAudio("run_stop"));
    await flushPromises();
    const firstAudio = harness.audios[0];
    if (!firstAudio) {
      throw new Error("expected active test audio");
    }
    firstAudio.currentTime = 3;

    harness.controller.stop();
    expect(firstAudio.pause).toHaveBeenCalledOnce();
    expect(firstAudio.currentTime).toBe(0);
    expect(harness.currentState()).toEqual({ source, type: "stopped" });
    firstAudio.emit("ended");
    expect(harness.synthesisRequests).toHaveLength(1);

    harness.controller.replaySummary(source);
    await flushPromises();
    expect(harness.synthesisRequests).toHaveLength(1);
    expect(harness.audios[1]?.url).toBe("blob:speech-1");
  });

  test("reset aborts playback scope, revokes cached audio, and permits a new automatic intent", async () => {
    const harness = createHarness();
    const source = summarySource("run_reset");

    harness.controller.enqueueAutomaticSummary(source);
    harness.resolveSynthesis(0, speechAudio("run_reset"));
    await flushPromises();
    harness.audios[0]?.emit("ended");
    harness.controller.reset();
    expect(harness.revokedURLs).toEqual(["blob:speech-1"]);
    expect(harness.currentState()).toEqual({ type: "idle" });

    harness.controller.enqueueAutomaticSummary(source);
    expect(harness.synthesisRequests).toHaveLength(2);
    harness.controller.dispose();
    expect(harness.synthesisSignals[1]?.aborted).toBe(true);
    harness.controller.replaySummary(source);
    expect(harness.synthesisRequests).toHaveLength(2);
  });

  test.each([
    ["wrong source", speechAudio("run_other")],
    ["wrong media type", { ...speechAudio("run_invalid"), mediaType: "audio/mpeg" }],
    ["wrong format", { ...speechAudio("run_invalid"), format: "mp3" }],
    ["empty payload", { ...speechAudio("run_invalid"), audioBase64: "" }],
  ])("fails visibly for an invalid %s response", async (_name, response) => {
    const harness = createHarness();
    const source = summarySource("run_invalid");

    harness.controller.replaySummary(source);
    harness.resolveSynthesis(0, response);
    await flushPromises();

    expect(harness.currentState()).toEqual({
      message: "The runtime returned invalid synthesized audio.",
      source,
      type: "failed",
    });
    expect(harness.audios).toEqual([]);
  });

  test("preserves a safe synthesis failure and does not fabricate audio", async () => {
    const harness = createHarness();
    const source = summarySource("run_failure");

    harness.controller.replaySummary(source);
    harness.rejectSynthesis(0, new Error("OpenAI speech rate limit or quota was reached."));
    await flushPromises();

    expect(harness.currentState()).toEqual({
      message: "OpenAI speech rate limit or quota was reached.",
      source,
      type: "failed",
    });
    expect(harness.audios).toEqual([]);
  });

  test("classifies malformed base64 without exposing decoder details", async () => {
    const harness = createHarness({
      decodeBase64: () => {
        throw new Error("private decoder detail");
      },
    });
    const source = summarySource("run_base64");

    harness.controller.replaySummary(source);
    harness.resolveSynthesis(0, speechAudio("run_base64"));
    await flushPromises();

    expect(harness.currentState()).toEqual({
      message: "The runtime returned invalid synthesized audio.",
      source,
      type: "failed",
    });
  });

  test("maps blocked and failed browser playback without altering the cached source", async () => {
    const blocked = Object.assign(new Error("browser detail"), { name: "NotAllowedError" });
    const harness = createHarness({ playError: blocked });
    const source = summarySource("run_blocked");

    harness.controller.replaySummary(source);
    harness.resolveSynthesis(0, speechAudio("run_blocked"));
    await flushPromises();
    expect(harness.currentState()).toEqual({
      message: "Audio playback was blocked. Use replay to try again.",
      source,
      type: "failed",
    });

    harness.setPlayError(null);
    harness.controller.replaySummary(source);
    await flushPromises();
    expect(harness.synthesisRequests).toHaveLength(1);
    expect(harness.currentState()).toEqual({ source, type: "speaking" });
    harness.audios[1]?.emit("error");
    expect(harness.currentState()).toEqual({
      message: "The synthesized run summary could not be played.",
      source,
      type: "failed",
    });
  });
});

class FakeAudio {
  currentTime = 0;
  readonly listeners = {
    ended: new Set<() => void>(),
    error: new Set<() => void>(),
  };
  readonly pause = vi.fn();
  readonly play = vi.fn(() =>
    this.playError ? Promise.reject(this.playError) : Promise.resolve(),
  );

  constructor(
    readonly url: string,
    private readonly playError: Error | null,
  ) {}

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
    decodeBase64?: SpeechPlaybackControllerDependencies["decodeBase64"];
    playError?: Error | null;
  } = {},
) {
  const states: SpeechPlaybackState[] = [];
  const synthesisRequests: Array<{ easyRunId: string; workspaceId: string }> = [];
  const synthesisSignals: AbortSignal[] = [];
  const synthesisResults: Array<Deferred<SpeechAudio>> = [];
  const audios: FakeAudio[] = [];
  const createdURLs: string[] = [];
  const revokedURLs: string[] = [];
  const mutable = {
    playError: options.playError ?? null,
  };
  const dependencies: SpeechPlaybackControllerDependencies = {
    createAbortController: () => new AbortController(),
    createAudio: (url) => {
      const audio = new FakeAudio(url, mutable.playError);
      audios.push(audio);
      return audio;
    },
    createObjectURL: () => {
      const url = `blob:speech-${createdURLs.length + 1}`;
      createdURLs.push(url);
      return url;
    },
    decodeBase64: options.decodeBase64 ?? (() => new Uint8Array([82, 73, 70, 70])),
    revokeObjectURL: (url) => revokedURLs.push(url),
    synthesizeSummary: (request, signal) => {
      synthesisRequests.push(request);
      synthesisSignals.push(signal);
      const result = deferred<SpeechAudio>();
      synthesisResults.push(result);
      return result.promise;
    },
  };
  const controller = new SpeechPlaybackController({
    dependencies,
    onStateChange: (state) => states.push(state),
  });
  return {
    audios,
    controller,
    createdURLs,
    currentState: () => states.at(-1) ?? controller.state,
    rejectSynthesis: (index: number, error: Error) => synthesisResults[index]?.reject(error),
    resolveSynthesis: (index: number, audio: SpeechAudio) =>
      synthesisResults[index]?.resolve(audio),
    revokedURLs,
    setPlayError: (error: Error | null) => {
      mutable.playError = error;
    },
    states,
    synthesisRequests,
    synthesisSignals,
  };
}

function summarySource(easyRunId: string): SpeechSummarySource {
  return { easyRunId, workspaceId: "workspace_playback" };
}

function speechAudio(sourceId: string): SpeechAudio {
  return {
    audioBase64: "UklGRg==",
    format: "wav",
    mediaType: "audio/wav",
    sourceId,
  };
}

interface Deferred<T> {
  promise: Promise<T>;
  reject: (error: Error) => void;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
