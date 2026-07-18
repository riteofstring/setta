import { BufferedMicrophoneWorkletEngine } from "./buffered-microphone-worklet-engine";
import {
  bufferedMicrophoneWorkletProcessorName,
  type BufferedMicrophoneWorkletCommand,
  type BufferedMicrophoneWorkletMessage,
} from "./buffered-microphone-worklet-messages";

declare const sampleRate: number;

declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;

  constructor();

  abstract process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
}

declare function registerProcessor(
  name: string,
  processorCtor: new (options: AudioWorkletNodeOptions) => AudioWorkletProcessor,
): void;

interface BufferedMicrophoneProcessorOptions {
  capacityFrames?: unknown;
  postRollFrames?: unknown;
}

class BufferedMicrophoneCaptureProcessor extends AudioWorkletProcessor {
  private readonly engine: BufferedMicrophoneWorkletEngine;

  constructor(options: AudioWorkletNodeOptions) {
    super();
    const processorOptions = options.processorOptions as BufferedMicrophoneProcessorOptions;
    this.engine = new BufferedMicrophoneWorkletEngine({
      capacityFrames: requiredPositiveInteger(processorOptions.capacityFrames, "capacityFrames"),
      defaultPostRollFrames: requiredNonNegativeInteger(
        processorOptions.postRollFrames,
        "postRollFrames",
      ),
      sampleRate,
    });
    this.port.onmessage = (event: MessageEvent<BufferedMicrophoneWorkletCommand>) => {
      this.postMessages(this.engine.command(event.data));
    };
  }

  override process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    _parameters: Record<string, Float32Array>,
  ): boolean {
    void _parameters;
    const output = outputs[0]?.[0];
    if (!output) {
      return this.engine.active;
    }
    this.postMessages(this.engine.process(inputs[0]?.[0] ?? null, output));
    return this.engine.active;
  }

  private postMessages(messages: BufferedMicrophoneWorkletMessage[]): void {
    for (const message of messages) {
      this.port.postMessage(message);
    }
  }
}

registerProcessor(bufferedMicrophoneWorkletProcessorName, BufferedMicrophoneCaptureProcessor);

function requiredPositiveInteger(value: unknown, name: string): number {
  if (!Number.isInteger(value) || (value as number) < 1) {
    throw new Error(`Buffered microphone worklet option ${name} must be a positive integer.`);
  }
  return value as number;
}

function requiredNonNegativeInteger(value: unknown, name: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`Buffered microphone worklet option ${name} must be a non-negative integer.`);
  }
  return value as number;
}
