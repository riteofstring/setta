import type { SpeechAudio, SynthesizeEasyRunSummaryRequest } from "@generated/backend";

export interface SpeechSummarySource {
  easyRunId: string;
  workspaceId: string;
}

export type SpeechPlaybackState =
  | { type: "idle" }
  | { source: SpeechSummarySource; type: "synthesizing" }
  | { source: SpeechSummarySource; type: "speaking" }
  | { source: SpeechSummarySource; type: "stopped" }
  | { message: string; source: SpeechSummarySource; type: "failed" };

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
  revokeObjectURL: (url: string) => void;
  synthesizeSummary: (
    request: SynthesizeEasyRunSummaryRequest,
    signal: AbortSignal,
  ) => Promise<SpeechAudio>;
}

interface SpeechPlaybackControllerOptions {
  dependencies?: SpeechPlaybackControllerDependencies;
  onStateChange: (state: SpeechPlaybackState) => void;
}

interface CachedSpeechAudio {
  sourceKey: string;
  url: string;
}

interface ActivePlayback {
  audio: PlaybackAudio;
  ended: () => void;
  failed: () => void;
}

interface QueuedSummary {
  source: SpeechSummarySource;
  sourceKey: string;
}

export class SpeechPlaybackController {
  private readonly dependencies: SpeechPlaybackControllerDependencies;
  private readonly onStateChange: SpeechPlaybackControllerOptions["onStateChange"];

  private abortController: AbortController | null = null;
  private activeItem: QueuedSummary | null = null;
  private activePlayback: ActivePlayback | null = null;
  private automaticSourceKeys = new Set<string>();
  private cachedAudio: CachedSpeechAudio | null = null;
  private disposed = false;
  private lifecycle = 0;
  private queue: QueuedSummary[] = [];

  state: SpeechPlaybackState = { type: "idle" };

  constructor(options: SpeechPlaybackControllerOptions) {
    this.dependencies = options.dependencies ?? browserSpeechPlaybackDependencies;
    this.onStateChange = options.onStateChange;
  }

  enqueueAutomaticSummary = (source: SpeechSummarySource): void => {
    const sourceKey = summarySourceKey(source);
    if (this.automaticSourceKeys.has(sourceKey)) {
      return;
    }
    this.automaticSourceKeys.add(sourceKey);
    this.enqueue({ source: copySource(source), sourceKey });
  };

  replaySummary = (source: SpeechSummarySource): void => {
    const sourceKey = summarySourceKey(source);
    this.enqueue({ source: copySource(source), sourceKey });
  };

  releaseSummary = (source: SpeechSummarySource): void => {
    const sourceKey = summarySourceKey(source);
    const stateMatches =
      this.state.type !== "idle" && summarySourceKey(this.state.source) === sourceKey;
    if (
      stateMatches ||
      this.activeItem?.sourceKey === sourceKey ||
      this.cachedAudio?.sourceKey === sourceKey ||
      this.queue.some((item) => item.sourceKey === sourceKey)
    ) {
      this.reset();
    }
  };

  stop = (): void => {
    if (!this.activeItem && this.queue.length === 0) {
      return;
    }
    const stoppedSource = this.activeItem?.source ?? this.queue[0]?.source;
    this.lifecycle += 1;
    this.abortController?.abort();
    this.abortController = null;
    this.queue = [];
    this.stopActiveAudio();
    this.activeItem = null;
    if (stoppedSource) {
      this.transition({ source: stoppedSource, type: "stopped" });
    }
  };

  reset = (): void => {
    this.lifecycle += 1;
    this.abortController?.abort();
    this.abortController = null;
    this.queue = [];
    this.stopActiveAudio();
    this.activeItem = null;
    this.automaticSourceKeys.clear();
    this.releaseCachedAudio();
    this.transition({ type: "idle" });
  };

  dispose = (): void => {
    if (this.disposed) {
      return;
    }
    this.reset();
    this.disposed = true;
  };

  private enqueue(item: QueuedSummary): void {
    if (this.disposed || this.hasPendingSource(item.sourceKey)) {
      return;
    }
    this.queue.push(item);
    this.playNext();
  }

  private hasPendingSource(sourceKey: string): boolean {
    return (
      this.activeItem?.sourceKey === sourceKey ||
      this.queue.some((item) => item.sourceKey === sourceKey)
    );
  }

  private playNext(): void {
    if (this.disposed || this.activeItem || this.queue.length === 0) {
      return;
    }
    const item = this.queue.shift();
    if (!item) {
      return;
    }
    this.activeItem = item;
    const lifecycle = this.lifecycle + 1;
    this.lifecycle = lifecycle;
    void this.prepareAndPlay(item, lifecycle);
  }

  private async prepareAndPlay(item: QueuedSummary, lifecycle: number): Promise<void> {
    const url = await this.resolveAudioURL(item, lifecycle);
    if (!url || !this.isCurrent(item, lifecycle)) {
      return;
    }
    this.beginAudioPlayback(item, lifecycle, url);
  }

  private resolveCachedAudioURL(item: QueuedSummary): string | null {
    if (this.cachedAudio?.sourceKey !== item.sourceKey) {
      this.releaseCachedAudio();
    }
    return this.cachedAudio?.sourceKey === item.sourceKey ? this.cachedAudio.url : null;
  }

  private async resolveAudioURL(item: QueuedSummary, lifecycle: number): Promise<string | null> {
    const cachedURL = this.resolveCachedAudioURL(item);
    if (cachedURL) {
      return cachedURL;
    }
    this.transition({ source: item.source, type: "synthesizing" });
    const abortController = this.dependencies.createAbortController();
    this.abortController = abortController;
    try {
      const response = await this.dependencies.synthesizeSummary(
        { easyRunId: item.source.easyRunId, workspaceId: item.source.workspaceId },
        abortController.signal,
      );
      return this.isCurrent(item, lifecycle) ? this.cacheResponse(item, response) : null;
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

  private cacheResponse(item: QueuedSummary, response: SpeechAudio): string {
    validateSpeechAudioResponse(item.source, response);
    let bytes: Uint8Array;
    try {
      bytes = this.dependencies.decodeBase64(response.audioBase64);
    } catch {
      throw new Error("The runtime returned invalid synthesized audio.");
    }
    if (bytes.byteLength === 0) {
      throw new Error("The runtime returned empty synthesized audio.");
    }
    const url = this.dependencies.createObjectURL(
      new Blob([bytes as BlobPart], { type: response.mediaType }),
    );
    this.releaseCachedAudio();
    this.cachedAudio = { sourceKey: item.sourceKey, url };
    return url;
  }

  private beginAudioPlayback(item: QueuedSummary, lifecycle: number, url: string): void {
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
    this.transition({ source: item.source, type: "speaking" });
    let playback: Promise<void>;
    try {
      playback = audio.play();
    } catch (error) {
      this.fail(item, playbackFailureMessage(error));
      return;
    }
    void playback.catch((error: unknown) => {
      if (!this.isCurrent(item, lifecycle) || this.activePlayback?.audio !== audio) {
        return;
      }
      this.fail(item, playbackFailureMessage(error));
    });
  }

  private finishAudio(item: QueuedSummary, lifecycle: number, audio: PlaybackAudio): void {
    if (!this.isCurrent(item, lifecycle) || this.activePlayback?.audio !== audio) {
      return;
    }
    this.removeActiveAudioListeners();
    this.activePlayback = null;
    this.activeItem = null;
    this.transition({ type: "idle" });
    this.playNext();
  }

  private failAudio(item: QueuedSummary, lifecycle: number, audio: PlaybackAudio): void {
    if (!this.isCurrent(item, lifecycle) || this.activePlayback?.audio !== audio) {
      return;
    }
    this.fail(item, "The synthesized run summary could not be played.");
  }

  private fail(item: QueuedSummary, message: string): void {
    this.abortController?.abort();
    this.abortController = null;
    this.stopActiveAudio();
    this.activeItem = null;
    this.queue = [];
    this.transition({ message, source: item.source, type: "failed" });
  }

  private isCurrent(item: QueuedSummary, lifecycle: number): boolean {
    return (
      !this.disposed &&
      this.lifecycle === lifecycle &&
      this.activeItem?.sourceKey === item.sourceKey
    );
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

  private releaseCachedAudio(): void {
    if (!this.cachedAudio) {
      return;
    }
    this.dependencies.revokeObjectURL(this.cachedAudio.url);
    this.cachedAudio = null;
  }

  private transition(state: SpeechPlaybackState): void {
    this.state = state;
    if (!this.disposed) {
      this.onStateChange(state);
    }
  }
}

const browserSpeechPlaybackDependencies: SpeechPlaybackControllerDependencies = {
  createAbortController: () => new AbortController(),
  createAudio: (url) => new Audio(url),
  createObjectURL: (blob) => URL.createObjectURL(blob),
  decodeBase64: decodeBase64,
  revokeObjectURL: (url) => URL.revokeObjectURL(url),
  synthesizeSummary: (request, signal) => {
    const operationId = createSpeechSynthesisOperationId();
    return abortableSpeechRequest(
      () => window.setta.speech.synthesizeEasyRunSummary(request, operationId),
      () => window.setta.speech.cancelSynthesis(operationId),
      signal,
    );
  },
};

let nextSpeechSynthesisOperationSequence = 1;

function createSpeechSynthesisOperationId(): string {
  const pageEpoch = Math.trunc(globalThis.performance.timeOrigin * 1000).toString(36);
  const sequence = nextSpeechSynthesisOperationSequence.toString(36);
  nextSpeechSynthesisOperationSequence += 1;
  return `speech_${pageEpoch}_${sequence}`;
}

function summarySourceKey(source: SpeechSummarySource): string {
  if (!source.workspaceId.trim() || !source.easyRunId.trim()) {
    throw new Error("Speech summary playback requires workspace and Easy Run IDs.");
  }
  return JSON.stringify([source.workspaceId, source.easyRunId, "summary"]);
}

function copySource(source: SpeechSummarySource): SpeechSummarySource {
  return { easyRunId: source.easyRunId, workspaceId: source.workspaceId };
}

function validateSpeechAudioResponse(source: SpeechSummarySource, response: SpeechAudio): void {
  if (
    response.sourceId !== source.easyRunId ||
    response.mediaType !== "audio/wav" ||
    response.format !== "wav" ||
    !response.audioBase64
  ) {
    throw new Error("The runtime returned invalid synthesized audio.");
  }
}

function decodeBase64(value: string): Uint8Array {
  const decoded = globalThis.atob(value);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes;
}

function synthesisFailureMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "The run summary could not be synthesized.";
}

function playbackFailureMessage(error: unknown): string {
  return error instanceof Error && error.name === "NotAllowedError"
    ? "Audio playback was blocked. Use replay to try again."
    : "The synthesized run summary could not be played.";
}

function abortableSpeechRequest<T>(
  start: () => Promise<T>,
  cancel: () => Promise<void>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(new DOMException("Speech synthesis was stopped.", "AbortError"));
  }
  return new Promise<T>((resolve, reject) => {
    const aborted = () => {
      void cancel().catch(() => undefined);
      reject(new DOMException("Speech synthesis was stopped.", "AbortError"));
    };
    signal.addEventListener("abort", aborted, { once: true });
    void start().then(
      (value) => {
        signal.removeEventListener("abort", aborted);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", aborted);
        reject(error);
      },
    );
  });
}
