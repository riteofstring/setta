import type {
  ConversationPresentationProfile,
  NarrationEvent,
  SpeechAudio,
  SpeechSource,
  SpeechSynthesisRequest,
  SpeechVoiceID,
} from "@generated/backend";

export type SpeechPlaybackIntentKind =
  | "master_answer"
  | "status_reply"
  | "attention"
  | "error"
  | "final_summary"
  | "milestone"
  | "progress_highlight";

interface SpeechPlaybackIntentBase {
  kind: SpeechPlaybackIntentKind;
  resolvedVoiceId: SpeechVoiceID;
  source: SpeechSource;
  sourceCreatedAt: string | null;
}

interface MasterSpeechPlaybackIntent extends SpeechPlaybackIntentBase {
  kind: "master_answer";
  source: SpeechSource & { conversationId: null; kind: "master_answer"; speaker: "master" };
}

export interface NarratorSpeechPlaybackIntent extends SpeechPlaybackIntentBase {
  kind: Exclude<SpeechPlaybackIntentKind, "master_answer">;
  source: SpeechSource & {
    conversationId: string;
    kind: "narration_event" | "progress_highlight";
    speaker: "narrator";
  };
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
  now: () => number;
  revokeObjectURL: (url: string) => void;
  synthesize: (request: SpeechSynthesisRequest, signal: AbortSignal) => Promise<SpeechAudio>;
}

export interface SpeechPlaybackObservation {
  action: "completed" | "dropped" | "enqueued" | "failed" | "play" | "preempted" | "synthesized";
  enqueuedAt: number;
  intent: SpeechPlaybackIntent;
  observedAt: number;
  playbackStartedAt: number | null;
  priority: number;
  queuePosition: number | null;
  reason:
    | "automatic"
    | "capture"
    | "expired"
    | "higher_priority"
    | "lower_priority"
    | "playback_failed"
    | "replaced"
    | "replay"
    | "reset"
    | "terminal"
    | "user"
    | null;
  sourceCreatedAt: string | null;
  sourceEventId: string;
  sourceLatencyMs: number | null;
  synthesisCompletedAt: number | null;
  synthesisStartedAt: number | null;
}

export interface SpeechPlaybackSupersessionDecision {
  reason: "final_summary_covers_unplayed_milestone";
  superseded: SpeechPlaybackIntent;
  superseding: SpeechPlaybackIntent;
}

interface QueuedSpeech {
  enqueuedAt: number;
  intent: SpeechPlaybackIntent;
  origin: "automatic" | "replay";
  playbackStartedAt: number | null;
  priority: number;
  sequence: number;
  sourceCreatedAtMs: number | null;
  sourceKey: string;
  synthesisCompletedAt: number | null;
  synthesisStartedAt: number | null;
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
const automaticMilestoneFreshnessMs = 4_000;

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
    const item = this.createItem(intent, "automatic");
    const automaticKey = speechSourceIdentityKey(intent.source);
    if (this.automaticSourceKeys.has(automaticKey)) {
      return;
    }
    this.automaticSourceKeys.add(automaticKey);
    this.enqueue(item, "automatic");
  };

  replay = (intent: SpeechPlaybackIntent): void => {
    this.assertUsable();
    this.enqueue(this.createItem(intent, "replay"), "replay");
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
    this.pruneQueueForCapture();
    if (!active) {
      this.publishSnapshot(this.snapshotValue.state);
      return;
    }
    const wasSpeaking = this.activePlayback !== null;
    this.cancelActiveForCapture();
    this.retainOrDropActiveForCapture(active, wasSpeaking);
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
    if (this.isExpiredAutomaticMilestone(item)) {
      this.observe(item, "dropped", "expired", null);
      return;
    }
    this.replacePendingAutomaticMilestone(item);
    if (isFinalSummaryIntent(item.intent)) {
      this.supersedeTerminalMilestones(item);
    }
    this.clearLowerPriorityPendingSpeech(item);
    this.queue.push(item);
    this.sortQueue();
    this.preemptLowerPrioritySynthesis(item);
    this.observe(item, "enqueued", reason, this.queuePosition(item));
    this.publishSnapshot(this.snapshotValue.state);
    this.playNext();
  }

  private createItem(intent: SpeechPlaybackIntent, origin: QueuedSpeech["origin"]): QueuedSpeech {
    const copy = copySpeechPlaybackIntent(intent);
    return {
      enqueuedAt: this.dependencies.now(),
      intent: copy,
      origin,
      playbackStartedAt: null,
      priority: speechPlaybackPriority(copy.kind),
      sequence: this.nextSequence++,
      sourceCreatedAtMs: speechSourceCreatedAtMs(copy),
      sourceKey: speechSourceCacheKey(copy),
      synthesisCompletedAt: null,
      synthesisStartedAt: null,
    };
  }

  private replacePendingAutomaticMilestone(newItem: QueuedSpeech): void {
    if (!isAutomaticMilestone(newItem)) {
      return;
    }
    const retained: QueuedSpeech[] = [];
    for (const queued of this.queue) {
      if (sameAutomaticMilestoneSource(newItem, queued)) {
        this.observe(queued, "dropped", "replaced", null);
      } else {
        retained.push(queued);
      }
    }
    this.queue = retained;
    if (
      this.activeItem &&
      !this.activePlayback &&
      sameAutomaticMilestoneSource(newItem, this.activeItem)
    ) {
      const superseded = this.activeItem;
      this.cancelActiveSynthesis();
      this.activeItem = null;
      this.observe(superseded, "dropped", "replaced", null);
    }
  }

  private supersedeTerminalMilestones(finalItem: QueuedSpeech): void {
    const retained: QueuedSpeech[] = [];
    for (const queued of this.queue) {
      if (terminalOutputInvalidatesMilestone(finalItem.intent, queued.intent)) {
        this.logSupersession(finalItem.intent, queued.intent);
        this.observe(queued, "dropped", "terminal", null);
      } else {
        retained.push(queued);
      }
    }
    this.queue = retained;
    if (
      this.activeItem &&
      !this.activePlayback &&
      terminalOutputInvalidatesMilestone(finalItem.intent, this.activeItem.intent)
    ) {
      const superseded = this.activeItem;
      this.cancelActiveSynthesis();
      this.activeItem = null;
      this.logSupersession(finalItem.intent, superseded.intent);
      this.observe(superseded, "dropped", "terminal", null);
    }
  }

  private clearLowerPriorityPendingSpeech(newItem: QueuedSpeech): void {
    if (!intentClearsLowerPrioritySpeech(newItem.intent)) {
      return;
    }
    const retained: QueuedSpeech[] = [];
    for (const queued of this.queue) {
      if (
        newItem.priority > queued.priority &&
        sameSpeechPreemptionScope(newItem.intent, queued.intent)
      ) {
        this.observe(queued, "dropped", "lower_priority", null);
      } else {
        retained.push(queued);
      }
    }
    this.queue = retained;
    if (
      this.activeItem &&
      !this.activePlayback &&
      newItem.priority > this.activeItem.priority &&
      sameSpeechPreemptionScope(newItem.intent, this.activeItem.intent)
    ) {
      const superseded = this.activeItem;
      this.cancelActiveSynthesis();
      this.activeItem = null;
      this.observe(superseded, "dropped", "lower_priority", null);
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
    const item = this.shiftPlayableItem();
    if (!item) {
      this.publishSnapshot(this.snapshotValue.state);
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
    if (this.isExpiredAutomaticMilestone(item)) {
      this.dropCurrentItem(item, lifecycle, "expired");
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
    item.synthesisStartedAt = this.dependencies.now();
    try {
      const response = await this.dependencies.synthesize(
        speechSynthesisRequest(item.intent),
        abortController.signal,
      );
      if (!this.isCurrent(item, lifecycle)) {
        return null;
      }
      const cached = this.cacheResponse(item, response);
      item.synthesisCompletedAt = this.dependencies.now();
      this.observe(item, "synthesized", null, null);
      return cached.url;
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
    item.playbackStartedAt = this.dependencies.now();
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

  private dropCurrentItem(item: QueuedSpeech, lifecycle: number, reason: "expired"): void {
    if (!this.isCurrent(item, lifecycle)) {
      return;
    }
    this.activeItem = null;
    this.observe(item, "dropped", reason, null);
    this.transition({ type: "idle" });
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

  private shiftPlayableItem(): QueuedSpeech | null {
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) {
        return null;
      }
      if (this.isExpiredAutomaticMilestone(item)) {
        this.observe(item, "dropped", "expired", null);
        continue;
      }
      return item;
    }
    return null;
  }

  private pruneQueueForCapture(): void {
    const queued = [...this.queue];
    this.queue = queued.filter((item) => this.retainForCapture(item));
    for (const dropped of queued) {
      if (!this.queue.includes(dropped)) {
        this.observe(dropped, "dropped", "capture", null);
      }
    }
  }

  private cancelActiveForCapture(): void {
    this.lifecycle += 1;
    this.abortController?.abort();
    this.abortController = null;
    this.stopActiveAudio();
    this.activeItem = null;
  }

  private retainOrDropActiveForCapture(active: QueuedSpeech, wasSpeaking: boolean): void {
    if (!wasSpeaking && this.retainForCapture(active)) {
      this.queue.push(active);
      this.sortQueue();
      this.observe(active, "preempted", "capture", this.queuePosition(active));
      return;
    }
    this.observe(active, "dropped", "capture", null);
  }

  private retainForCapture(item: QueuedSpeech): boolean {
    return !isAutomaticMilestone(item) || !this.isExpiredAutomaticMilestone(item);
  }

  private isExpiredAutomaticMilestone(item: QueuedSpeech): boolean {
    if (!isAutomaticMilestone(item) || item.sourceCreatedAtMs === null) {
      return false;
    }
    return this.dependencies.now() - item.sourceCreatedAtMs > automaticMilestoneFreshnessMs;
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
    const observedAt = this.dependencies.now();
    this.dependencies.logPlayback({
      action,
      enqueuedAt: item.enqueuedAt,
      intent: copySpeechPlaybackIntent(item.intent),
      observedAt,
      playbackStartedAt: item.playbackStartedAt,
      priority: item.priority,
      queuePosition,
      reason,
      sourceCreatedAt: item.intent.sourceCreatedAt,
      sourceEventId: item.intent.source.eventId,
      sourceLatencyMs:
        item.sourceCreatedAtMs === null ? null : Math.max(0, observedAt - item.sourceCreatedAtMs),
      synthesisCompletedAt: item.synthesisCompletedAt,
      synthesisStartedAt: item.synthesisStartedAt,
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
  const kind = narrationPlaybackKind(event);
  if (!kind) {
    return null;
  }
  return {
    kind,
    resolvedVoiceId: profile.resolvedNarratorVoiceId,
    source: {
      conversationId: event.conversationId,
      eventId: event.id,
      kind: "narration_event",
      speaker: "narrator",
    },
    sourceCreatedAt: event.createdAt,
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
    case "progress_highlight":
      return 1;
    default:
      return assertNever(kind);
  }
}

function narrationPlaybackKind(event: NarrationEvent): NarratorSpeechPlaybackIntent["kind"] | null {
  switch (event.kind) {
    case "status_reply":
      return "status_reply";
    case "final_summary":
    case "milestone":
    case "topic_descriptor":
      return null;
    default:
      return assertNever(event.kind);
  }
}

function terminalOutputInvalidatesMilestone(
  finalIntent: SpeechPlaybackIntent,
  candidate: SpeechPlaybackIntent,
): boolean {
  return (
    isFinalSummaryIntent(finalIntent) &&
    candidate.kind === "milestone" &&
    sameNarratorTurn(finalIntent, candidate) &&
    candidate.sourceSequenceEnd <= finalIntent.sourceSequenceEnd
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

function speechSynthesisRequest(intent: SpeechPlaybackIntent): SpeechSynthesisRequest {
  return {
    resolvedVoiceId: intent.resolvedVoiceId,
    source: { ...intent.source },
  };
}

function speechSourceCacheKey(intent: SpeechPlaybackIntent): string {
  return JSON.stringify([speechSourceIdentityKey(intent.source), intent.resolvedVoiceId]);
}

function speechSourceCreatedAtMs(intent: SpeechPlaybackIntent): number | null {
  if (intent.sourceCreatedAt === null) {
    return null;
  }
  const parsed = Date.parse(intent.sourceCreatedAt);
  if (!Number.isFinite(parsed)) {
    throw new Error("speech playback requires a valid source creation timestamp");
  }
  return parsed;
}

function speechSourceIdentityKey(source: SpeechSource): string {
  assertNormalizedSpeechSourceEventId(source);
  switch (source.speaker) {
    case "master":
      return masterSpeechSourceIdentityKey(source);
    case "narrator":
      return narratorSpeechSourceIdentityKey(source);
    default:
      return assertNever(source.speaker);
  }
}

function assertNormalizedSpeechSourceEventId(source: SpeechSource): void {
  if (!source.eventId.trim() || source.eventId.trim() !== source.eventId) {
    throw new Error("speech playback requires a normalized source event id");
  }
}

function masterSpeechSourceIdentityKey(source: SpeechSource): string {
  if (source.kind !== "master_answer") {
    throw new Error("master speech playback requires a master-answer source");
  }
  if (source.conversationId !== null) {
    throw new Error("master speech playback must not include a conversation id");
  }
  return JSON.stringify([source.speaker, source.kind, source.eventId]);
}

function narratorSpeechSourceIdentityKey(source: SpeechSource): string {
  if (source.kind !== "narration_event" && source.kind !== "progress_highlight") {
    throw new Error("narrator speech playback requires a narrator source kind");
  }
  if (!source.conversationId?.trim() || source.conversationId.trim() !== source.conversationId) {
    throw new Error("narrator speech playback requires a normalized conversation id");
  }
  return JSON.stringify([source.speaker, source.kind, source.conversationId, source.eventId]);
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
    case "progress_highlight":
      return { ...intent, source: { ...intent.source } };
    default:
      return assertNever(intent);
  }
}

function isAutomaticMilestone(item: QueuedSpeech): boolean {
  return item.origin === "automatic" && item.intent.kind === "milestone";
}

function sameAutomaticMilestoneSource(left: QueuedSpeech, right: QueuedSpeech): boolean {
  return (
    isAutomaticMilestone(left) &&
    isAutomaticMilestone(right) &&
    left.intent.source.speaker === "narrator" &&
    right.intent.source.speaker === "narrator" &&
    left.intent.source.conversationId === right.intent.source.conversationId
  );
}

function intentClearsLowerPrioritySpeech(intent: SpeechPlaybackIntent): boolean {
  switch (intent.kind) {
    case "attention":
    case "error":
    case "final_summary":
    case "master_answer":
      return true;
    case "milestone":
    case "progress_highlight":
    case "status_reply":
      return false;
    default:
      return assertNever(intent);
  }
}

function sameSpeechPreemptionScope(
  left: SpeechPlaybackIntent,
  right: SpeechPlaybackIntent,
): boolean {
  if (left.kind === "master_answer" || right.kind === "master_answer") {
    return left.kind === "master_answer" && right.kind === "master_answer";
  }
  return left.source.conversationId === right.source.conversationId && left.turnId === right.turnId;
}

function validateSpeechAudioResponse(intent: SpeechPlaybackIntent, response: SpeechAudio): void {
  if (
    response.source.speaker !== intent.source.speaker ||
    response.source.kind !== intent.source.kind ||
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
