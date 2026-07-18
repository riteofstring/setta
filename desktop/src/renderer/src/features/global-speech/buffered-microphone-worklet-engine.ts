import {
  BoundedSampleRing,
  BoundedSampleRingOverflowError,
} from "./buffered-microphone-sample-ring";
import type {
  BufferedMicrophoneCaptureMetrics,
  BufferedMicrophoneWorkletCommand,
  BufferedMicrophoneWorkletMessage,
} from "./buffered-microphone-worklet-messages";

type BufferedMicrophoneEngineMode =
  | "buffering"
  | "closed"
  | "drained"
  | "draining"
  | "failed"
  | "released"
  | "waiting_for_release_to_drain";

export interface BufferedMicrophoneWorkletEngineOptions {
  capacityFrames: number;
  defaultPostRollFrames: number;
  sampleRate: number;
}

export class BufferedMicrophoneWorkletEngine {
  private capturedFrames = 0;
  private emittedQueuedFrames = 0;
  private emittedSilenceFrames = 0;
  private mode: BufferedMicrophoneEngineMode = "buffering";
  private postRollFrames = 0;
  private postRollRemainingFrames = 0;
  private readySent = false;
  private readonly ring: BoundedSampleRing;
  private workletFrame = 0;

  constructor(private readonly options: BufferedMicrophoneWorkletEngineOptions) {
    assertPositiveInteger(options.capacityFrames, "capacityFrames");
    assertNonNegativeInteger(options.defaultPostRollFrames, "defaultPostRollFrames");
    assertPositiveInteger(options.sampleRate, "sampleRate");
    this.ring = new BoundedSampleRing(options.capacityFrames);
  }

  get active(): boolean {
    return this.mode !== "closed" && this.mode !== "drained" && this.mode !== "failed";
  }

  command(command: BufferedMicrophoneWorkletCommand): BufferedMicrophoneWorkletMessage[] {
    switch (command.type) {
      case "close":
        return this.close(command.sequence);
      case "finish":
        return this.finish(command);
      case "release":
        return this.release(command.sequence);
      default:
        return assertNever(command);
    }
  }

  metrics(): BufferedMicrophoneCaptureMetrics {
    return {
      capacityFrames: this.options.capacityFrames,
      capturedFrames: this.capturedFrames,
      emittedQueuedFrames: this.emittedQueuedFrames,
      emittedSilenceFrames: this.emittedSilenceFrames,
      postRollFrames: this.postRollFrames,
      queuedFrames: this.ring.queuedFrames,
      sampleRate: this.options.sampleRate,
    };
  }

  process(input: Float32Array | null, output: Float32Array): BufferedMicrophoneWorkletMessage[] {
    output.fill(0);
    const events: BufferedMicrophoneWorkletMessage[] = [];
    switch (this.mode) {
      case "buffering":
        this.enqueueInput(input, events);
        if (!isTerminalMode(this.mode)) {
          this.markReady(events);
        }
        this.emittedSilenceFrames += output.length;
        break;
      case "released":
        this.emitReleasedFrames(input, output, events);
        break;
      case "waiting_for_release_to_drain":
        this.emittedSilenceFrames += output.length;
        break;
      case "draining":
        events.push(...this.drain(output));
        break;
      case "closed":
      case "drained":
      case "failed":
        break;
      default:
        assertNever(this.mode);
    }
    this.workletFrame += output.length;
    return events;
  }

  private close(sequence: number): BufferedMicrophoneWorkletMessage[] {
    if (isTerminalMode(this.mode)) {
      return [];
    }
    this.ring.clear();
    this.mode = "closed";
    return [
      {
        metrics: this.metrics(),
        sequence,
        type: "closed",
        workletFrame: this.workletFrame,
      },
    ];
  }

  private drain(output: Float32Array): BufferedMicrophoneWorkletMessage[] {
    const events: BufferedMicrophoneWorkletMessage[] = [];
    const queuedFrames = this.ring.read(output);
    this.emittedQueuedFrames += queuedFrames;
    const remainingOutputFrames = output.length - queuedFrames;
    const postRollFrames = Math.min(remainingOutputFrames, this.postRollRemainingFrames);
    this.postRollRemainingFrames -= postRollFrames;
    this.emittedSilenceFrames += postRollFrames;
    if (this.ring.queuedFrames === 0 && this.postRollRemainingFrames === 0) {
      this.mode = "drained";
      events.push({
        metrics: this.metrics(),
        sequence: this.lastDrainSequence,
        type: "drained",
        workletFrame: this.workletFrame + queuedFrames + postRollFrames,
      });
    }
    return events;
  }

  private emitReleasedFrames(
    input: Float32Array | null,
    output: Float32Array,
    events: BufferedMicrophoneWorkletMessage[],
  ): void {
    if (this.ring.queuedFrames === 0) {
      this.enqueueInput(input, events);
      const currentFrames = this.ring.read(output);
      this.emittedQueuedFrames += currentFrames;
      return;
    }
    const retainedFrames = this.ring.read(output);
    this.emittedQueuedFrames += retainedFrames;
    this.enqueueInput(input, events);
  }

  private enqueueInput(
    input: Float32Array | null,
    events: BufferedMicrophoneWorkletMessage[],
  ): void {
    if (!input || input.length === 0 || isTerminalMode(this.mode)) {
      return;
    }
    try {
      this.ring.push(input);
      this.capturedFrames += input.length;
    } catch (error) {
      if (!(error instanceof BoundedSampleRingOverflowError)) {
        throw error;
      }
      const queuedFrames = error.queuedFrames;
      this.ring.clear();
      this.mode = "failed";
      events.push({
        capacityFrames: error.capacityFrames,
        incomingFrames: error.incomingFrames,
        metrics: this.metrics(),
        queuedFrames,
        sequence: 0,
        type: "overflow",
        workletFrame: this.workletFrame,
      });
    }
  }

  private markReady(events: BufferedMicrophoneWorkletMessage[]): void {
    if (this.readySent) {
      return;
    }
    this.readySent = true;
    events.push({
      metrics: this.metrics(),
      sequence: 0,
      type: "ready",
      workletFrame: this.workletFrame,
    });
  }

  private finish(command: Extract<BufferedMicrophoneWorkletCommand, { type: "finish" }>) {
    if (isTerminalMode(this.mode)) {
      return [];
    }
    this.lastDrainSequence = command.sequence;
    this.postRollFrames = command.postRollFrames ?? this.options.defaultPostRollFrames;
    assertNonNegativeInteger(this.postRollFrames, "postRollFrames");
    this.postRollRemainingFrames = this.postRollFrames;
    if (this.mode === "buffering") {
      this.mode = "waiting_for_release_to_drain";
    } else if (this.mode === "released") {
      this.mode = "draining";
    }
    return [
      {
        metrics: this.metrics(),
        postRollFrames: this.postRollFrames,
        queuedFrames: this.ring.queuedFrames,
        sequence: command.sequence,
        type: "finish_started",
        workletFrame: this.workletFrame,
      },
    ] satisfies BufferedMicrophoneWorkletMessage[];
  }

  private lastDrainSequence = 0;

  private release(sequence: number): BufferedMicrophoneWorkletMessage[] {
    if (isTerminalMode(this.mode)) {
      return [];
    }
    if (this.mode === "waiting_for_release_to_drain") {
      this.mode = "draining";
    } else if (this.mode === "buffering") {
      this.mode = "released";
    }
    if (this.mode !== "released" && this.mode !== "draining") {
      return [];
    }
    return [
      {
        metrics: this.metrics(),
        queuedFrames: this.ring.queuedFrames,
        sequence,
        type: "released",
        workletFrame: this.workletFrame,
      },
    ];
  }
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`Buffered microphone ${name} must be a positive integer.`);
  }
}

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Buffered microphone ${name} must be a non-negative integer.`);
  }
}

function isTerminalMode(mode: BufferedMicrophoneEngineMode): boolean {
  return mode === "closed" || mode === "drained" || mode === "failed";
}

function assertNever(value: never): never {
  throw new Error(`Unhandled buffered microphone worklet state: ${JSON.stringify(value)}`);
}
