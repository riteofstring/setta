import workletModuleURL from "./buffered-microphone-capture-worklet.ts?url";
import {
  bufferedMicrophoneWorkletProcessorName,
  type BufferedMicrophoneWorkletCommand,
  type BufferedMicrophoneWorkletMessage,
} from "./buffered-microphone-worklet-messages";

const defaultPostRollSeconds = 0.08;

export type BufferedMicrophoneCaptureErrorCode =
  | "aborted"
  | "capture_buffer_overflow"
  | "capture_pipeline_failed"
  | "invalid_media";

export class BufferedMicrophoneCaptureError extends Error {
  readonly code: BufferedMicrophoneCaptureErrorCode;

  constructor(code: BufferedMicrophoneCaptureErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "BufferedMicrophoneCaptureError";
    this.code = code;
  }
}

export interface BufferedMicrophoneCapture {
  readonly outboundStream: MediaStream;
  readonly ready: Promise<void>;
  close: () => void;
  releaseToTransport: () => void;
  stopInputAndDrain: () => Promise<void>;
}

interface BufferedMicrophoneCaptureDependencies {
  createAudioContext: () => BufferedMicrophoneAudioContextPort;
  createAudioWorkletNode: (
    context: BufferedMicrophoneAudioContextPort,
    name: string,
    options: AudioWorkletNodeOptions,
  ) => BufferedMicrophoneAudioWorkletNodePort;
  workletModuleURL: string;
}

export interface BufferedMicrophoneAudioContextPort {
  readonly audioWorklet: {
    addModule: (moduleURL: string) => Promise<void>;
  };
  readonly sampleRate: number;
  readonly state: AudioContextState;
  close: () => Promise<void>;
  createMediaStreamDestination: () => BufferedMicrophoneMediaStreamDestinationPort;
  createMediaStreamSource: (stream: MediaStream) => BufferedMicrophoneAudioNodePort;
  resume: () => Promise<void>;
}

export interface BufferedMicrophoneAudioNodePort {
  connect: (destination: BufferedMicrophoneAudioNodePort) => void;
  disconnect: () => void;
}

export interface BufferedMicrophoneAudioWorkletNodePort extends BufferedMicrophoneAudioNodePort {
  onprocessorerror: ((event: Event) => void) | null;
  readonly port: BufferedMicrophoneMessagePort;
}

export interface BufferedMicrophoneMediaStreamDestinationPort extends BufferedMicrophoneAudioNodePort {
  readonly stream: MediaStream;
}

export interface BufferedMicrophoneMessagePort {
  onmessage: ((event: MessageEvent<BufferedMicrophoneWorkletMessage>) => void) | null;
  close?: () => void;
  postMessage: (message: BufferedMicrophoneWorkletCommand) => void;
}

export interface CreateBufferedMicrophoneCaptureOptions {
  dependencies?: Partial<BufferedMicrophoneCaptureDependencies>;
  inputStream: MediaStream;
  maximumRecordingSeconds: number;
  onError: (error: BufferedMicrophoneCaptureError) => void;
  postRollFrames?: number;
}

export async function createBufferedMicrophoneCapture(
  options: CreateBufferedMicrophoneCaptureOptions,
): Promise<BufferedMicrophoneCapture> {
  validateMediaStream(
    options.inputStream,
    "Buffered microphone capture requires one live input track.",
  );
  assertPositiveInteger(options.maximumRecordingSeconds, "maximumRecordingSeconds");
  const dependencies = bufferedMicrophoneCaptureDependencies(options.dependencies);
  const context = dependencies.createAudioContext();
  const resources = new PendingBufferedMicrophoneResources(options.inputStream, context);
  try {
    await resumeAudioContext(context);
    await context.audioWorklet.addModule(dependencies.workletModuleURL);
    const source = context.createMediaStreamSource(options.inputStream);
    const destination = context.createMediaStreamDestination();
    const capacityFrames = Math.ceil(options.maximumRecordingSeconds * context.sampleRate);
    const postRollFrames =
      options.postRollFrames ?? Math.ceil(defaultPostRollSeconds * context.sampleRate);
    assertNonNegativeInteger(postRollFrames, "postRollFrames");
    const worklet = dependencies.createAudioWorkletNode(
      context,
      bufferedMicrophoneWorkletProcessorName,
      {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: {
          capacityFrames,
          postRollFrames,
        },
      },
    );
    source.connect(worklet);
    worklet.connect(destination);
    validateMediaStream(
      destination.stream,
      "Buffered microphone capture requires one live outbound audio track.",
    );
    return new BrowserBufferedMicrophoneCapture({
      context,
      destination,
      inputStream: options.inputStream,
      onError: options.onError,
      source,
      worklet,
    });
  } catch (cause) {
    resources.close();
    throw capturePipelineError(cause);
  }
}

class BrowserBufferedMicrophoneCapture implements BufferedMicrophoneCapture {
  readonly outboundStream: MediaStream;
  readonly ready: Promise<void>;

  private commandSequence = 0;
  private drainSequence: number | null = null;
  private readonly readyDeferred = deferred<void>();
  private readonly drainDeferred = deferred<void>();
  private inputStopped = false;
  private releaseSequence: number | null = null;
  private state: "active" | "closed" | "failed" = "active";
  private readonly workletMessageHandlers = {
    closed: () => {},
    drained: (message) => this.acceptDrainMessage(message.sequence),
    error: () => this.failCapturePipeline(),
    finish_started: () => {},
    overflow: () => this.failCaptureBufferOverflow(),
    ready: (message) => this.acceptReadyMessage(message.sequence),
    released: () => {},
  } satisfies Record<
    BufferedMicrophoneWorkletMessage["type"],
    (message: BufferedMicrophoneWorkletMessage) => void
  >;

  constructor(private readonly resources: BufferedMicrophoneCaptureResources) {
    this.outboundStream = resources.destination.stream;
    this.ready = this.readyDeferred.promise;
    resources.worklet.port.onmessage = (event) => this.acceptWorkletMessage(event.data);
    resources.worklet.onprocessorerror = () => {
      this.fail(
        new BufferedMicrophoneCaptureError(
          "capture_pipeline_failed",
          "The buffered microphone audio processor failed.",
        ),
      );
    };
  }

  close = (): void => {
    if (this.state === "closed") {
      return;
    }
    this.state = "closed";
    this.postCommand({ sequence: this.nextCommandSequence(), type: "close" });
    const error = new BufferedMicrophoneCaptureError(
      "aborted",
      "Buffered microphone capture was canceled.",
    );
    this.readyDeferred.reject(error);
    this.drainDeferred.reject(error);
    this.closeResources();
  };

  releaseToTransport = (): void => {
    if (this.state !== "active" || this.releaseSequence !== null) {
      return;
    }
    const sequence = this.nextCommandSequence();
    this.releaseSequence = sequence;
    this.postCommand({ sequence, type: "release" });
  };

  stopInputAndDrain = (): Promise<void> => {
    if (this.state !== "active") {
      return Promise.reject(
        new BufferedMicrophoneCaptureError("aborted", "Buffered microphone capture is not active."),
      );
    }
    this.stopInput();
    if (this.drainSequence === null) {
      const sequence = this.nextCommandSequence();
      this.drainSequence = sequence;
      this.postCommand({ sequence, type: "finish" });
    }
    return this.drainDeferred.promise;
  };

  private acceptWorkletMessage(message: BufferedMicrophoneWorkletMessage): void {
    if (this.state !== "active") {
      return;
    }
    this.workletMessageHandlers[message.type](message);
  }

  private acceptDrainMessage(sequence: number): void {
    if (sequence === this.drainSequence) {
      this.drainDeferred.resolve();
    }
  }

  private failCaptureBufferOverflow(): void {
    this.fail(
      new BufferedMicrophoneCaptureError(
        "capture_buffer_overflow",
        "The buffered microphone queue could not preserve the recording.",
      ),
    );
  }

  private failCapturePipeline(): void {
    this.fail(
      new BufferedMicrophoneCaptureError(
        "capture_pipeline_failed",
        "The buffered microphone audio processor reported a failure.",
      ),
    );
  }

  private acceptReadyMessage(sequence: number): void {
    if (sequence === 0) {
      this.readyDeferred.resolve();
    }
  }

  private closeResources(): void {
    this.stopInput();
    stopMediaStream(this.outboundStream);
    this.resources.worklet.port.onmessage = null;
    this.resources.worklet.onprocessorerror = null;
    this.resources.worklet.port.close?.();
    this.resources.worklet.disconnect();
    this.resources.destination.disconnect();
    void this.resources.context.close();
  }

  private fail(error: BufferedMicrophoneCaptureError): void {
    if (this.state !== "active") {
      return;
    }
    this.state = "failed";
    this.readyDeferred.reject(error);
    this.drainDeferred.reject(error);
    this.closeResources();
    this.resources.onError(error);
  }

  private nextCommandSequence(): number {
    this.commandSequence += 1;
    return this.commandSequence;
  }

  private postCommand(command: BufferedMicrophoneWorkletCommand): void {
    this.resources.worklet.port.postMessage(command);
  }

  private stopInput(): void {
    if (this.inputStopped) {
      return;
    }
    this.inputStopped = true;
    stopMediaStream(this.resources.inputStream);
    this.resources.source.disconnect();
  }
}

interface BufferedMicrophoneCaptureResources {
  context: BufferedMicrophoneAudioContextPort;
  destination: BufferedMicrophoneMediaStreamDestinationPort;
  inputStream: MediaStream;
  onError: (error: BufferedMicrophoneCaptureError) => void;
  source: BufferedMicrophoneAudioNodePort;
  worklet: BufferedMicrophoneAudioWorkletNodePort;
}

class PendingBufferedMicrophoneResources {
  constructor(
    private readonly inputStream: MediaStream,
    private readonly context: BufferedMicrophoneAudioContextPort,
  ) {}

  close(): void {
    stopMediaStream(this.inputStream);
    void this.context.close();
  }
}

function bufferedMicrophoneCaptureDependencies(
  overrides: Partial<BufferedMicrophoneCaptureDependencies> | undefined,
): BufferedMicrophoneCaptureDependencies {
  return {
    createAudioContext: createBrowserAudioContext,
    createAudioWorkletNode: createBrowserAudioWorkletNode,
    workletModuleURL,
    ...overrides,
  };
}

function capturePipelineError(cause: unknown): BufferedMicrophoneCaptureError {
  if (cause instanceof BufferedMicrophoneCaptureError) {
    return cause;
  }
  return new BufferedMicrophoneCaptureError(
    "capture_pipeline_failed",
    "The buffered microphone audio pipeline could not be created.",
    { cause },
  );
}

function createBrowserAudioContext(): BufferedMicrophoneAudioContextPort {
  return new AudioContext({
    latencyHint: "interactive",
  }) as unknown as BufferedMicrophoneAudioContextPort;
}

function createBrowserAudioWorkletNode(
  context: BufferedMicrophoneAudioContextPort,
  name: string,
  options: AudioWorkletNodeOptions,
): BufferedMicrophoneAudioWorkletNodePort {
  return new AudioWorkletNode(
    context as unknown as AudioContext,
    name,
    options,
  ) as unknown as BufferedMicrophoneAudioWorkletNodePort;
}

async function resumeAudioContext(context: BufferedMicrophoneAudioContextPort): Promise<void> {
  if (context.state !== "running") {
    await context.resume();
  }
  if (context.state !== "running") {
    throw new BufferedMicrophoneCaptureError(
      "capture_pipeline_failed",
      "The buffered microphone audio context could not be resumed.",
    );
  }
}

function stopMediaStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

function validateMediaStream(stream: MediaStream, message: string): void {
  const tracks = stream.getTracks();
  const audioTracks = stream.getAudioTracks();
  if (
    tracks.length !== 1 ||
    audioTracks.length !== 1 ||
    tracks[0]?.kind !== "audio" ||
    audioTracks[0]?.readyState === "ended"
  ) {
    throw new BufferedMicrophoneCaptureError("invalid_media", message);
  }
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new BufferedMicrophoneCaptureError(
      "capture_pipeline_failed",
      `Buffered microphone ${name} must be a positive integer.`,
    );
  }
}

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new BufferedMicrophoneCaptureError(
      "capture_pipeline_failed",
      `Buffered microphone ${name} must be a non-negative integer.`,
    );
  }
}

function deferred<T>() {
  let reject!: (error: unknown) => void;
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    reject = rejectPromise;
    resolve = resolvePromise;
  });
  promise.catch(() => {});
  return { promise, reject, resolve };
}
