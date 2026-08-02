import { describe, expect, test, vi } from "vitest";

import {
  createBufferedMicrophoneCapture,
  type BufferedMicrophoneCaptureError,
  type BufferedMicrophoneAudioContextPort,
  type BufferedMicrophoneAudioNodePort,
  type BufferedMicrophoneAudioWorkletNodePort,
  type BufferedMicrophoneMediaStreamDestinationPort,
  type BufferedMicrophoneMessagePort,
} from "./buffered-microphone-capture";
import type {
  BufferedMicrophoneCaptureMetrics,
  BufferedMicrophoneWorkletCommand,
  BufferedMicrophoneWorkletMessage,
} from "./buffered-microphone-worklet-messages";

describe("buffered microphone capture lease", () => {
  test("builds a resumed Web Audio graph and resolves readiness from the worklet", async () => {
    const harness = createHarness({ contextState: "suspended" });

    const capture = await harness.createCapture();
    harness.worklet.port.emit({ sequence: 0, type: "ready" });
    await capture.ready;

    expect(harness.context.resume).toHaveBeenCalledOnce();
    expect(harness.context.audioWorklet.addModule).toHaveBeenCalledWith("test-worklet.js");
    expect(harness.context.source.connect).toHaveBeenCalledWith(harness.worklet);
    expect(harness.worklet.connect).toHaveBeenCalledWith(harness.context.destination);
    expect(harness.workletOptions()).toMatchObject({
      name: "setta-buffered-microphone-capture",
      options: {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: {
          capacityFrames: 480_000,
          postRollFrames: 3_840,
        },
      },
    });
  });

  test("stopInputAndDrain stops the raw microphone immediately and ignores stale drain messages", async () => {
    const harness = createHarness();
    const capture = await harness.createCapture();
    const drain = capture.stopInputAndDrain();
    let drained = false;
    drain.then(() => {
      drained = true;
    });

    expect(harness.inputTrack.stop).toHaveBeenCalledOnce();
    expect(harness.context.source.disconnect).toHaveBeenCalledOnce();
    expect(harness.worklet.port.commands).toEqual([{ sequence: 1, type: "finish" }]);

    capture.releaseToTransport();
    expect(harness.worklet.port.commands).toEqual([
      { sequence: 1, type: "finish" },
      { sequence: 2, type: "release" },
    ]);

    harness.worklet.port.emit({ sequence: 999, type: "drained" });
    await flushPromises();
    expect(drained).toBe(false);

    harness.worklet.port.emit({ sequence: 1, type: "drained" });
    await drain;
    expect(drained).toBe(true);
  });

  test("release before finish preserves command sequencing for normal drain", async () => {
    const harness = createHarness();
    const capture = await harness.createCapture();

    capture.releaseToTransport();
    const drain = capture.stopInputAndDrain();
    harness.worklet.port.emit({ sequence: 2, type: "drained" });
    await drain;

    expect(harness.worklet.port.commands).toEqual([
      { sequence: 1, type: "release" },
      { sequence: 2, type: "finish" },
    ]);
  });

  test("worklet overflow becomes a typed visible failure and closes resources once", async () => {
    const onError = vi.fn();
    const harness = createHarness({ onError });
    const capture = await harness.createCapture();

    harness.worklet.port.emit({ sequence: 0, type: "overflow" });

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: "capture_buffer_overflow" }),
    );
    await expect(capture.ready).rejects.toMatchObject({ code: "capture_buffer_overflow" });
    expect(harness.inputTrack.stop).toHaveBeenCalledOnce();
    expect(harness.outboundTrack.stop).toHaveBeenCalledOnce();
    expect(harness.context.close).toHaveBeenCalledOnce();

    capture.close();
    expect(harness.worklet.port.commands).toEqual([]);
    expect(harness.context.close).toHaveBeenCalledOnce();
  });

  test("duplicate close is idempotent and rejects pending readiness and drain", async () => {
    const harness = createHarness();
    const capture = await harness.createCapture();
    const drain = capture.stopInputAndDrain();

    capture.close();
    capture.close();

    await expect(capture.ready).rejects.toMatchObject({ code: "aborted" });
    await expect(drain).rejects.toMatchObject({ code: "aborted" });
    expect(harness.inputTrack.stop).toHaveBeenCalledOnce();
    expect(harness.outboundTrack.stop).toHaveBeenCalledOnce();
    expect(harness.context.close).toHaveBeenCalledOnce();
    expect(harness.worklet.port.close).toHaveBeenCalledOnce();
  });

  test("rejects ended input and failed audio context resume before exposing a lease", async () => {
    const ended = createHarness({ inputTrackState: "ended" });
    await expect(ended.createCapture()).rejects.toMatchObject({ code: "invalid_media" });
    expect(ended.inputTrack.stop).toHaveBeenCalledOnce();
    expect(ended.context.close).not.toHaveBeenCalled();

    const suspended = createHarness({ contextState: "suspended", resumeLeavesSuspended: true });
    await expect(suspended.createCapture()).rejects.toMatchObject({
      code: "capture_pipeline_failed",
    });
    expect(suspended.inputTrack.stop).toHaveBeenCalledOnce();
    expect(suspended.context.close).toHaveBeenCalledOnce();
  });

  test("stops partially created output resources when setup fails after graph creation", async () => {
    const harness = createHarness({ outboundTrackState: "ended" });

    await expect(harness.createCapture()).rejects.toMatchObject({ code: "invalid_media" });

    expect(harness.inputTrack.stop).toHaveBeenCalledOnce();
    expect(harness.outboundTrack.stop).toHaveBeenCalledOnce();
    expect(harness.context.source.disconnect).toHaveBeenCalledOnce();
    expect(harness.worklet.disconnect).toHaveBeenCalledOnce();
    expect(harness.context.destination.disconnect).toHaveBeenCalledOnce();
    expect(harness.context.close).toHaveBeenCalledOnce();
  });
});

interface HarnessOptions {
  contextState?: AudioContextState;
  inputTrackState?: MediaStreamTrackState;
  onError?: (error: BufferedMicrophoneCaptureError) => void;
  outboundTrackState?: MediaStreamTrackState;
  resumeLeavesSuspended?: boolean;
}

function createHarness(options: HarnessOptions = {}) {
  const inputTrack = fakeAudioTrack(options.inputTrackState ?? "live");
  const outboundTrack = fakeAudioTrack(options.outboundTrackState ?? "live");
  const inputStream = fakeMediaStream(inputTrack);
  const outboundStream = fakeMediaStream(outboundTrack);
  const context = new FakeAudioContext(options.contextState ?? "running", outboundStream);
  context.resumeLeavesSuspended = options.resumeLeavesSuspended ?? false;
  const worklet = new FakeWorkletNode();
  let createdWorklet: { name: string; options: AudioWorkletNodeOptions } | null = null;
  return {
    context,
    createCapture: () =>
      createBufferedMicrophoneCapture({
        dependencies: {
          createAudioContext: () => context,
          createAudioWorkletNode: (_context, name, workletOptions) => {
            createdWorklet = { name, options: workletOptions };
            return worklet;
          },
          workletModuleURL: "test-worklet.js",
        },
        inputStream,
        maximumRecordingSeconds: 10,
        onError: options.onError ?? (() => {}),
      }),
    inputTrack,
    outboundTrack,
    worklet,
    workletOptions: () => {
      if (!createdWorklet) {
        throw new Error("worklet was not created");
      }
      return createdWorklet;
    },
  };
}

class FakeAudioContext implements BufferedMicrophoneAudioContextPort {
  readonly audioWorklet = {
    addModule: vi.fn(async () => {}),
  };
  readonly destination: FakeDestinationNode;
  readonly sampleRate = 48_000;
  readonly source = new FakeAudioNode();
  state: AudioContextState;
  resumeLeavesSuspended = false;

  close = vi.fn(async () => {});
  createMediaStreamSource = vi.fn(() => this.source);
  createMediaStreamDestination = vi.fn(() => this.destination);
  resume = vi.fn(async () => {
    if (!this.resumeLeavesSuspended) {
      this.state = "running";
    }
  });

  constructor(state: AudioContextState, stream: MediaStream) {
    this.state = state;
    this.destination = new FakeDestinationNode(stream);
  }
}

class FakeAudioNode implements BufferedMicrophoneAudioNodePort {
  connect = vi.fn(() => {});
  disconnect = vi.fn();
}

class FakeDestinationNode
  extends FakeAudioNode
  implements BufferedMicrophoneMediaStreamDestinationPort
{
  constructor(readonly stream: MediaStream) {
    super();
  }
}

class FakeMessagePort implements BufferedMicrophoneMessagePort {
  onmessage: ((event: MessageEvent<BufferedMicrophoneWorkletMessage>) => void) | null = null;
  readonly commands: BufferedMicrophoneWorkletCommand[] = [];
  close = vi.fn();

  emit(message: MinimalWorkletMessage): void {
    this.onmessage?.({
      data: {
        metrics: metrics(),
        workletFrame: 0,
        ...message,
      },
    } as MessageEvent<BufferedMicrophoneWorkletMessage>);
  }

  postMessage = vi.fn((message: BufferedMicrophoneWorkletCommand) => {
    this.commands.push(message);
  });
}

class FakeWorkletNode extends FakeAudioNode implements BufferedMicrophoneAudioWorkletNodePort {
  onprocessorerror: (() => void) | null = null;
  readonly port = new FakeMessagePort();
}

type MinimalWorkletMessage =
  | { sequence: number; type: "drained" | "ready" }
  | { sequence: number; type: "overflow" };

function fakeAudioTrack(readyState: MediaStreamTrackState): MediaStreamTrack {
  return {
    enabled: true,
    kind: "audio",
    readyState,
    stop: vi.fn(),
  } as unknown as MediaStreamTrack;
}

function fakeMediaStream(track: MediaStreamTrack): MediaStream {
  return {
    getAudioTracks: () => [track],
    getTracks: () => [track],
  } as unknown as MediaStream;
}

function metrics(): BufferedMicrophoneCaptureMetrics {
  return {
    capacityFrames: 480_000,
    capturedFrames: 0,
    emittedQueuedFrames: 0,
    emittedSilenceFrames: 0,
    postRollFrames: 3_840,
    queuedFrames: 0,
    sampleRate: 48_000,
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
