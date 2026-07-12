import type {
  ConversationPresentationProfile,
  NarrationEvent,
  SpeechAudio,
  SpeechSource,
  SpeechSynthesisRequest,
  SpeechVoiceID,
  TurnStatus,
} from "@generated/backend";

export type SpeechPlaybackIntentKind =
  | "master_answer"
  | "status_reply"
  | "attention"
  | "error"
  | "final_summary"
  | "milestone";

interface SpeechPlaybackIntentBase {
  kind: SpeechPlaybackIntentKind;
  resolvedVoiceId: SpeechVoiceID;
  source: SpeechSource;
}

interface MasterSpeechPlaybackIntent extends SpeechPlaybackIntentBase {
  kind: "master_answer";
  source: SpeechSource & { conversationId: null; speaker: "master" };
}

export interface NarratorSpeechPlaybackIntent extends SpeechPlaybackIntentBase {
  kind: Exclude<SpeechPlaybackIntentKind, "master_answer">;
  source: SpeechSource & { conversationId: string; speaker: "narrator" };
  sourceSequenceEnd: number;
  sourceSequenceStart: number;
  turnId: string | null;
}

export type SpeechPlaybackIntent = MasterSpeechPlaybackIntent | NarratorSpeechPlaybackIntent;

export type SpeechPlaybackState =
  | { type: "idle" }
  | { intent: SpeechPlaybackIntent; type: "synthesizing" }
  | { intent: SpeechPlaybackIntent; type: "speaking" }
  | {
      intent: SpeechPlaybackIntent;
      reason: "capture" | "user";
      type: "stopped";
    }
  | { intent: SpeechPlaybackIntent; message: string; type: "failed" };

export interface SpeechPlaybackSnapshot {
  queued: readonly SpeechPlaybackIntent[];
  state: SpeechPlaybackState;
}

interface PlaybackAudio {
  currentTime: number;
  addEventListener: (type: "ended" | "error", listener: () => void) => void;
  pause: () => void;
  play: () => Promise<void>;
  removeEventListener: (type: "ended" | "error", listener: () => void) => void;
}

export interface SpeechPlaybackControllerDependencies {
  createAbortController: () => AbortController;
  createAudio: (url: string) => PlaybackAudio;
  createObjectURL: (blob: Blob) => string;
  decodeBase64: (value: string) => Uint8Array;
  logPlayback: (observation: SpeechPlaybackObservation) => void;
  logSupersession: (decision: SpeechPlaybackSupersessionDecision) => void;
  revokeObjectURL: (url: string) => void;
  synthesize: (request: SpeechSynthesisRequest, signal: AbortSignal) => Promise<SpeechAudio>;
}

export interface SpeechPlaybackObservation {
  action: "completed" | "dropped" | "enqueued" | "failed" | "play" | "preempted";
  intent: SpeechPlaybackIntent;
  priority: number;
  queuePosition: number | null;
  reason:
    | "automatic"
    | "capture"
    | "higher_priority"
    | "playback_failed"
    | "replay"
    | "reset"
    | "user"
    | null;
}

export interface SpeechPlaybackSupersessionDecision {
  reason: "final_summary_covers_unplayed_milestone";
  superseded: SpeechPlaybackIntent;
  superseding: SpeechPlaybackIntent;
}

interface QueuedSpeech {
  intent: SpeechPlaybackIntent;
  priority: number;
  sequence: number;
  sourceKey: string;
}

interface ActivePlayback {
  audio: PlaybackAudio;
  ended: () => void;
  failed: () => void;
}

interface CachedSpeechAudio {
  sourceKey: string;
  url: string;
}

const maximumCachedAudio = 16;

export class AppShellSpeechPlaybackController {
  private readonly automaticSourceKeys = new Set<string>();
  private readonly cache = new Map<string, CachedSpeechAudio>();
  private readonly dependencies: SpeechPlaybackControllerDependencies;
  private readonly listeners = new Set<() => void>();

  private abortController: AbortController | null = null;
  private activeItem: QueuedSpeech | null = null;
  private activePlayback: ActivePlayback | null = null;
  private captureActive = false;
  private disposed = false;
  private lifecycle = 0;
  private nextSequence = 1;
  private queue: QueuedSpeech[] = [];
  private runtimeId: string | null = null;
  private snapshotValue: SpeechPlaybackSnapshot = { queued: [], state: { type: "idle" } };

  constructor(dependencies: SpeechPlaybackControllerDependencies) {
    this.dependencies = dependencies;
  }

  getSnapshot = (): SpeechPlaybackSnapshot => this.snapshotValue;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  synchronizeRuntime = (runtimeId: string | null): void => {
    this.assertUsable();
    if (runtimeId === this.runtimeId) {
      return;
    }
    this.runtimeId = runtimeId;
    this.reset();
  };

  enqueueAutomatic = (intent: SpeechPlaybackIntent): void => {
    this.assertUsable();
    const item = this.createItem(intent);
    const automaticKey = speechSourceIdentityKey(intent.source);
    if (this.automaticSourceKeys.has(automaticKey)) {
      return;
    }
    this.automaticSourceKeys.add(automaticKey);
    this.enqueue(item, "automatic");
  };

  replay = (intent: SpeechPlaybackIntent): void => {
    this.assertUsable();
    this.enqueue(this.createItem(intent), "replay");
  };

  stop = (): void => {
    this.stopWithReason("user");
  };

  preemptForCapture = (): void => {
    this.assertUsable();
    if (this.captureActive) {
      return;
    }
    this.captureActive = true;
    const active = this.activeItem;
    if (!active) {
      this.publishSnapshot(this.snapshotValue.state);
      return;
    }
    const wasSpeaking = this.activePlayback !== null;
    this.lifecycle += 1;
    this.abortController?.abort();
    this.abortController = null;
    this.stopActiveAudio();
    this.activeItem = null;
    if (!wasSpeaking) {
      this.queue.push(active);
      this.sortQueue();
      this.observe(active, "preempted", "capture", this.queuePosition(active));
    } else {
      this.observe(active, "dropped", "capture", null);
    }
    this.transition({ intent: active.intent, reason: "capture", type: "stopped" });
  };

  resumeAfterCapture = (): void => {
    if (this.disposed || !this.captureActive) {
      return;
    }
    this.captureActive = false;
    this.publishSnapshot(this.snapshotValue.state);
    this.playNext();
  };

  reset = (): void => {
    this.observeDiscardedWork("reset");
    this.lifecycle += 1;
    this.abortController?.abort();
    this.abortController = null;
    this.captureActive = false;
    this.queue = [];
    this.stopActiveAudio();
    this.activeItem = null;
    this.automaticSourceKeys.clear();
    this.releaseAllCachedAudio();
    this.transition({ type: "idle" });
  };

  dispose = (): void => {
    if (this.disposed) {
      return;
    }
    this.reset();
    this.disposed = true;
    this.listeners.clear();
  };

  private enqueue(item: QueuedSpeech, reason: "automatic" | "replay"): void {
    if (this.disposed || this.hasPendingSource(item.sourceKey)) {
      return;
    }
    if (item.intent.kind === "final_summary" || item.intent.kind === "error") {
      this.supersedeCoveredMilestones(item);
    }
    this.queue.push(item);
    this.sortQueue();
    this.preemptLowerPrioritySynthesis(item);
    this.observe(item, "enqueued", reason, this.queuePosition(item));
    this.publishSnapshot(this.snapshotValue.state);
    this.playNext();
  }

  private createItem(intent: SpeechPlaybackIntent): QueuedSpeech {
    const copy = copySpeechPlaybackIntent(intent);
    return {
      intent: copy,
      priority: speechPlaybackPriority(copy.kind),
      sequence: this.nextSequence++,
      sourceKey: speechSourceCacheKey(copy),
    };
  }

  private supersedeCoveredMilestones(finalItem: QueuedSpeech): void {
    const retained: QueuedSpeech[] = [];
    for (const queued of this.queue) {
      if (finalSummaryCoversMilestone(finalItem.intent, queued.intent)) {
        this.logSupersession(finalItem.intent, queued.intent);
      } else {
        retained.push(queued);
      }
    }
    this.queue = retained;
    if (
      this.activeItem &&
      !this.activePlayback &&
      finalSummaryCoversMilestone(finalItem.intent, this.activeItem.intent)
    ) {
      const superseded = this.activeItem.intent;
      this.cancelActiveSynthesis();
      this.activeItem = null;
      this.logSupersession(finalItem.intent, superseded);
    }
  }

  private logSupersession(
    superseding: SpeechPlaybackIntent,
    superseded: SpeechPlaybackIntent,
  ): void {
    this.dependencies.logSupersession({
      reason: "final_summary_covers_unplayed_milestone",
      superseded,
      superseding,
    });
  }

  private preemptLowerPrioritySynthesis(newItem: QueuedSpeech): void {
    const active = this.activeItem;
    if (!active || this.activePlayback || active.priority >= newItem.priority) {
      return;
    }
    this.cancelActiveSynthesis();
    this.activeItem = null;
    this.queue.push(active);
    this.sortQueue();
    this.observe(active, "preempted", "higher_priority", this.queuePosition(active));
  }

  private playNext(): void {
    if (this.disposed || this.captureActive || this.activeItem || this.queue.length === 0) {
      return;
    }
    const item = this.queue.shift();
    if (!item) {
      return;
    }
    this.activeItem = item;
    this.lifecycle += 1;
    const lifecycle = this.lifecycle;
    this.publishSnapshot(this.snapshotValue.state);
    void this.prepareAndPlay(item, lifecycle);
  }

  private async prepareAndPlay(item: QueuedSpeech, lifecycle: number): Promise<void> {
    const url = await this.resolveAudioURL(item, lifecycle);
    if (!url || !this.isCurrent(item, lifecycle)) {
      return;
    }
    this.beginAudioPlayback(item, lifecycle, url);
  }

  private async resolveAudioURL(item: QueuedSpeech, lifecycle: number): Promise<string | null> {
    const cached = this.readCachedAudio(item.sourceKey);
    if (cached) {
      return cached.url;
    }
    this.transition({ intent: item.intent, type: "synthesizing" });
    const abortController = this.dependencies.createAbortController();
    this.abortController = abortController;
    try {
      const response = await this.dependencies.synthesize(
        speechSynthesisRequest(item.intent),
        abortController.signal,
      );
      return this.isCurrent(item, lifecycle) ? this.cacheResponse(item, response).url : null;
    } catch (error) {
      if (this.isCurrent(item, lifecycle)) {
        this.fail(item, synthesisFailureMessage(error));
      }
      return null;
    } finally {
      if (this.abortController === abortController) {
        this.abortController = null;
      }
    }
  }

  private cacheResponse(item: QueuedSpeech, response: SpeechAudio): CachedSpeechAudio {
    validateSpeechAudioResponse(item.intent, response);
    let bytes: Uint8Array;
    try {
      bytes = this.dependencies.decodeBase64(response.audioBase64);
    } catch {
      throw new Error("The runtime returned invalid synthesized audio.");
    }
    if (bytes.byteLength === 0) {
      throw new Error("The runtime returned empty synthesized audio.");
    }
    const cached = {
      sourceKey: item.sourceKey,
      url: this.dependencies.createObjectURL(
        new Blob([bytes as BlobPart], { type: response.mediaType }),
      ),
    };
    this.cache.set(item.sourceKey, cached);
    this.evictCachedAudio();
    return cached;
  }

  private readCachedAudio(sourceKey: string): CachedSpeechAudio | null {
    const cached = this.cache.get(sourceKey);
    if (!cached) {
      return null;
    }
    this.cache.delete(sourceKey);
    this.cache.set(sourceKey, cached);
    return cached;
  }

  private evictCachedAudio(): void {
    while (this.cache.size > maximumCachedAudio) {
      const oldestKey = this.cache.keys().next().value;
      if (typeof oldestKey !== "string") {
        throw new Error("speech playback cache ordering is invalid");
      }
      const oldest = this.cache.get(oldestKey);
      this.cache.delete(oldestKey);
      if (oldest) {
        this.dependencies.revokeObjectURL(oldest.url);
      }
    }
  }

  private beginAudioPlayback(item: QueuedSpeech, lifecycle: number, url: string): void {
    let audio: PlaybackAudio;
    try {
      audio = this.dependencies.createAudio(url);
    } catch (error) {
      this.fail(item, playbackFailureMessage(error));
      return;
    }
    const ended = () => this.finishAudio(item, lifecycle, audio);
    const failed = () => this.failAudio(item, lifecycle, audio);
    this.activePlayback = { audio, ended, failed };
    audio.addEventListener("ended", ended);
    audio.addEventListener("error", failed);
    this.transition({ intent: item.intent, type: "speaking" });
    this.observe(item, "play", null, 0);
    try {
      void audio.play().catch((error: unknown) => {
        if (this.isCurrent(item, lifecycle) && this.activePlayback?.audio === audio) {
          this.fail(item, playbackFailureMessage(error));
        }
      });
    } catch (error) {
      this.fail(item, playbackFailureMessage(error));
    }
  }

  private finishAudio(item: QueuedSpeech, lifecycle: number, audio: PlaybackAudio): void {
    if (!this.isCurrent(item, lifecycle) || this.activePlayback?.audio !== audio) {
      return;
    }
    this.removeActiveAudioListeners();
    this.activePlayback = null;
    this.activeItem = null;
    this.observe(item, "completed", null, null);
    this.transition({ type: "idle" });
    this.playNext();
  }

  private failAudio(item: QueuedSpeech, lifecycle: number, audio: PlaybackAudio): void {
    if (this.isCurrent(item, lifecycle) && this.activePlayback?.audio === audio) {
      this.fail(item, playbackFailureMessage());
    }
  }

  private fail(item: QueuedSpeech, message: string): void {
    this.cancelActiveSynthesis();
    this.stopActiveAudio();
    this.activeItem = null;
    this.observe(item, "failed", "playback_failed", null);
    this.transition({ intent: item.intent, message, type: "failed" });
    this.playNext();
  }

  private stopWithReason(reason: "capture" | "user"): void {
    this.assertUsable();
    if (!this.activeItem && this.queue.length === 0) {
      return;
    }
    const active = this.activeItem;
    const queued = [...this.queue];
    const stoppedIntent = this.activeItem?.intent ?? this.queue[0]?.intent;
    this.lifecycle += 1;
    this.abortController?.abort();
    this.abortController = null;
    this.queue = [];
    this.stopActiveAudio();
    this.activeItem = null;
    this.observeDroppedWork(active, queued, reason);
    if (stoppedIntent) {
      this.transition({ intent: stoppedIntent, reason, type: "stopped" });
    }
  }

  private cancelActiveSynthesis(): void {
    this.lifecycle += 1;
    this.abortController?.abort();
    this.abortController = null;
  }

  private isCurrent(item: QueuedSpeech, lifecycle: number): boolean {
    return (
      !this.disposed &&
      this.lifecycle === lifecycle &&
      this.activeItem?.sourceKey === item.sourceKey
    );
  }

  private hasPendingSource(sourceKey: string): boolean {
    return (
      this.activeItem?.sourceKey === sourceKey ||
      this.queue.some((item) => item.sourceKey === sourceKey)
    );
  }

  private sortQueue(): void {
    this.queue.sort(
      (left, right) => right.priority - left.priority || left.sequence - right.sequence,
    );
  }

  private queuePosition(item: QueuedSpeech): number {
    const position = this.queue.indexOf(item);
    if (position < 0) {
      throw new Error("speech playback item is missing from its queue");
    }
    return position + 1;
  }

  private observeDiscardedWork(reason: "reset"): void {
    this.observeDroppedWork(this.activeItem, this.queue, reason);
  }

  private observeDroppedWork(
    active: QueuedSpeech | null,
    queued: readonly QueuedSpeech[],
    reason: "capture" | "reset" | "user",
  ): void {
    if (active) {
      this.observe(active, "dropped", reason, null);
    }
    for (const item of queued) {
      this.observe(item, "dropped", reason, null);
    }
  }

  private observe(
    item: QueuedSpeech,
    action: SpeechPlaybackObservation["action"],
    reason: SpeechPlaybackObservation["reason"],
    queuePosition: number | null,
  ): void {
    this.dependencies.logPlayback({
      action,
      intent: copySpeechPlaybackIntent(item.intent),
      priority: item.priority,
      queuePosition,
      reason,
    });
  }

  private stopActiveAudio(): void {
    if (!this.activePlayback) {
      return;
    }
    const { audio } = this.activePlayback;
    this.removeActiveAudioListeners();
    audio.pause();
    audio.currentTime = 0;
    this.activePlayback = null;
  }

  private removeActiveAudioListeners(): void {
    if (!this.activePlayback) {
      return;
    }
    const { audio, ended, failed } = this.activePlayback;
    audio.removeEventListener("ended", ended);
    audio.removeEventListener("error", failed);
  }

  private releaseAllCachedAudio(): void {
    for (const cached of this.cache.values()) {
      this.dependencies.revokeObjectURL(cached.url);
    }
    this.cache.clear();
  }

  private transition(state: SpeechPlaybackState): void {
    this.publishSnapshot(state);
  }

  private publishSnapshot(state: SpeechPlaybackState): void {
    this.snapshotValue = {
      queued: this.queue.map((item) => item.intent),
      state,
    };
    if (this.disposed) {
      return;
    }
    for (const listener of this.listeners) {
      listener();
    }
  }

  private assertUsable(): void {
    if (this.disposed) {
      throw new Error("app-shell speech playback controller is disposed");
    }
  }
}

export function narrationSpeechPlaybackIntent(
  event: NarrationEvent,
  profile: ConversationPresentationProfile,
  turnStatus: TurnStatus | null,
): NarratorSpeechPlaybackIntent | null {
  if (event.conversationId !== profile.conversationId) {
    throw new Error("narration speech event and presentation profile ownership do not match");
  }
  if (!profile.narratorSpeechEnabled) {
    return null;
  }
  if (!profile.resolvedNarratorVoiceId) {
    throw new Error("enabled narrator speech requires a resolved narrator voice");
  }
  const kind = narrationPlaybackKind(event, turnStatus);
  if (!kind) {
    return null;
  }
  return {
    kind,
    resolvedVoiceId: profile.resolvedNarratorVoiceId,
    source: {
      conversationId: event.conversationId,
      eventId: event.id,
      speaker: "narrator",
    },
    sourceSequenceEnd: event.sourceSequenceEnd,
    sourceSequenceStart: event.sourceSequenceStart,
    turnId: event.turnId,
  };
}

export function speechPlaybackPriority(kind: SpeechPlaybackIntentKind): number {
  switch (kind) {
    case "master_answer":
    case "status_reply":
      return 4;
    case "attention":
    case "error":
      return 3;
    case "final_summary":
      return 2;
    case "milestone":
      return 1;
    default:
      return assertNever(kind);
  }
}

function narrationPlaybackKind(
  event: NarrationEvent,
  turnStatus: TurnStatus | null,
): NarratorSpeechPlaybackIntent["kind"] | null {
  switch (event.kind) {
    case "status_reply":
      return "status_reply";
    case "final_summary":
      if (turnStatus === null) {
        throw new Error("final narration playback requires its authoritative turn status");
      }
      return turnStatus === "failed" ? "error" : "final_summary";
    case "milestone":
      return event.trigger === "approval_required" ? "attention" : "milestone";
    case "topic_descriptor":
      return null;
    default:
      return assertNever(event.kind);
  }
}

function finalSummaryCoversMilestone(
  finalIntent: SpeechPlaybackIntent,
  candidate: SpeechPlaybackIntent,
): boolean {
  return (
    isFinalSummaryIntent(finalIntent) &&
    candidate.kind === "milestone" &&
    sameNarratorTurn(finalIntent, candidate) &&
    sourceRangeCovers(finalIntent, candidate)
  );
}

function isFinalSummaryIntent(
  intent: SpeechPlaybackIntent,
): intent is NarratorSpeechPlaybackIntent {
  return intent.kind === "final_summary" || intent.kind === "error";
}

function sameNarratorTurn(
  finalIntent: NarratorSpeechPlaybackIntent,
  milestone: NarratorSpeechPlaybackIntent,
): boolean {
  return (
    finalIntent.source.conversationId === milestone.source.conversationId &&
    finalIntent.turnId !== null &&
    finalIntent.turnId === milestone.turnId
  );
}

function sourceRangeCovers(
  finalIntent: NarratorSpeechPlaybackIntent,
  milestone: NarratorSpeechPlaybackIntent,
): boolean {
  return (
    finalIntent.sourceSequenceStart <= milestone.sourceSequenceStart &&
    finalIntent.sourceSequenceEnd >= milestone.sourceSequenceEnd
  );
}

function speechSynthesisRequest(intent: SpeechPlaybackIntent): SpeechSynthesisRequest {
  return {
    resolvedVoiceId: intent.resolvedVoiceId,
    source: { ...intent.source },
  };
}

function speechSourceCacheKey(intent: SpeechPlaybackIntent): string {
  return JSON.stringify([speechSourceIdentityKey(intent.source), intent.resolvedVoiceId]);
}

function speechSourceIdentityKey(source: SpeechSource): string {
  if (!source.eventId.trim() || source.eventId.trim() !== source.eventId) {
    throw new Error("speech playback requires a normalized source event id");
  }
  switch (source.speaker) {
    case "master":
      if (source.conversationId !== null) {
        throw new Error("master speech playback must not include a conversation id");
      }
      return JSON.stringify([source.speaker, source.eventId]);
    case "narrator":
      if (
        !source.conversationId?.trim() ||
        source.conversationId.trim() !== source.conversationId
      ) {
        throw new Error("narrator speech playback requires a normalized conversation id");
      }
      return JSON.stringify([source.speaker, source.conversationId, source.eventId]);
    default:
      return assertNever(source.speaker);
  }
}

function copySpeechPlaybackIntent(intent: SpeechPlaybackIntent): SpeechPlaybackIntent {
  switch (intent.kind) {
    case "master_answer":
      return { ...intent, source: { ...intent.source } };
    case "status_reply":
    case "attention":
    case "error":
    case "final_summary":
    case "milestone":
      return { ...intent, source: { ...intent.source } };
    default:
      return assertNever(intent);
  }
}

function validateSpeechAudioResponse(intent: SpeechPlaybackIntent, response: SpeechAudio): void {
  if (
    response.source.speaker !== intent.source.speaker ||
    response.source.eventId !== intent.source.eventId ||
    response.source.conversationId !== intent.source.conversationId ||
    response.resolvedVoiceId !== intent.resolvedVoiceId ||
    response.mediaType !== "audio/wav" ||
    response.format !== "wav" ||
    !response.audioBase64
  ) {
    throw new Error("The runtime returned invalid synthesized audio.");
  }
}

function synthesisFailureMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "The speech source could not be synthesized.";
}

function playbackFailureMessage(error?: unknown): string {
  return error instanceof Error && error.name === "NotAllowedError"
    ? "Audio playback was blocked. Use replay to try again."
    : "The synthesized speech could not be played.";
}

function assertNever(value: never): never {
  throw new Error(`Unsupported speech playback value: ${JSON.stringify(value)}`);
}
