/* global AudioWorkletProcessor, currentFrame, registerProcessor, sampleRate */

class SettaSpeechRealtimeProcessedAudioObserver extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const processorOptions = options.processorOptions ?? {};
    this.rmsThreshold = nonNegativeFiniteNumber(processorOptions.rmsThreshold, "rmsThreshold");
    this.observedFrames = 0;
    this.reported = false;
    this.port.postMessage({
      metrics: {
        rmsThreshold: this.rmsThreshold,
        sampleRate,
      },
      type: "ready",
    });
  }

  process(inputs, outputs) {
    const output = outputs[0]?.[0];
    if (output) {
      output.fill(0);
    }
    const input = inputs[0]?.[0] ?? null;
    if (input) {
      this.observeInput(input);
    }
    return true;
  }

  observeInput(input) {
    this.observedFrames += input.length;
    if (this.reported || input.length === 0) {
      return;
    }
    let peak = 0;
    let total = 0;
    for (const sample of input) {
      const magnitude = Math.abs(sample);
      peak = Math.max(peak, magnitude);
      total += sample * sample;
    }
    const rms = Math.sqrt(total / input.length);
    if (rms < this.rmsThreshold) {
      return;
    }
    this.reported = true;
    this.port.postMessage({
      observedFrames: this.observedFrames,
      peak,
      rms,
      sampleFrames: input.length,
      type: "processed_audio_marker",
      workletFrame: currentFrame,
    });
  }
}

function nonNegativeFiniteNumber(value, field) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a non-negative finite number`);
  }
  return value;
}

registerProcessor(
  "setta-speech-realtime-processed-audio-observer",
  SettaSpeechRealtimeProcessedAudioObserver,
);
