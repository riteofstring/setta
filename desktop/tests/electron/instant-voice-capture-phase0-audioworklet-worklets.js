/* global AudioWorkletProcessor, currentFrame, registerProcessor, sampleRate */

class SettaPhase0AudioGateProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const processorOptions = options.processorOptions ?? {};
    this.capacityFrames = positiveInteger(processorOptions.capacityFrames, "capacityFrames");
    this.markerFrames = positiveInteger(processorOptions.markerFrames, "markerFrames");
    this.markerThreshold = finiteNumber(processorOptions.markerThreshold, "markerThreshold");
    this.postRollFrames = positiveInteger(processorOptions.postRollFrames, "postRollFrames");
    this.queue = [];
    this.queueFrames = 0;
    this.released = false;
    this.finishing = false;
    this.drained = false;
    this.postRollRemainingFrames = 0;
    this.metrics = {
      capacityFrames: this.capacityFrames,
      contextSampleRate: sampleRate,
      emittedFrames: 0,
      enqueuedFrames: 0,
      peakQueuedFrames: 0,
      postRollFrames: this.postRollFrames,
    };
    this.inputMarkers = [
      new MarkerDetector("prefix", "positive", this.markerThreshold, this.markerFrames),
      new MarkerDetector("tail", "negative", this.markerThreshold, this.markerFrames),
    ];
    this.port.onmessage = (event) => this.acceptCommand(event.data);
    this.port.postMessage({
      metrics: { ...this.metrics },
      type: "ready",
    });
  }

  acceptCommand(command) {
    if (!command || typeof command !== "object") {
      this.port.postMessage({ message: "audio gate command must be an object", type: "error" });
      return;
    }
    switch (command.type) {
      case "release":
        this.released = true;
        this.port.postMessage({
          queuedFrames: this.queueFrames,
          type: "released",
        });
        break;
      case "finish":
        this.finishing = true;
        this.released = true;
        this.postRollRemainingFrames = this.postRollFrames;
        this.port.postMessage({
          queuedFrames: this.queueFrames,
          type: "finish_started",
        });
        break;
      case "close":
        this.queue = [];
        this.queueFrames = 0;
        this.finishing = true;
        this.drained = true;
        this.port.postMessage({ metrics: { ...this.metrics }, type: "closed" });
        break;
      default:
        this.port.postMessage({
          message: `unknown audio gate command ${String(command.type)}`,
          type: "error",
        });
        break;
    }
  }

  process(inputs, outputs) {
    const output = outputs[0]?.[0];
    if (!output) {
      return this.keepProcessing();
    }
    output.fill(0);
    this.acceptProcessInput(inputs[0]?.[0] ?? null);
    this.emitWhenActive(output);
    this.markDrainedWhenReady();
    return this.keepProcessing();
  }

  keepProcessing() {
    return !this.drained;
  }

  acceptProcessInput(input) {
    if (!input) {
      return;
    }
    if (this.finishing || this.drained) {
      return;
    }
    this.enqueueInput(input);
  }

  emitWhenActive(output) {
    if (!this.released && !this.finishing) {
      return;
    }
    this.emitNext(output);
  }

  markDrainedWhenReady() {
    if (!this.finishing) {
      return;
    }
    if (this.queueFrames !== 0 || this.postRollRemainingFrames !== 0) {
      return;
    }
    this.markDrained();
  }

  enqueueInput(input) {
    if (this.queueFrames + input.length > this.capacityFrames) {
      this.finishing = true;
      this.drained = true;
      this.port.postMessage({
        capacityFrames: this.capacityFrames,
        queueFrames: this.queueFrames,
        type: "overflow",
      });
      return;
    }
    const retained = new Float32Array(input.length);
    retained.set(input);
    this.queue.push(retained);
    this.queueFrames += retained.length;
    this.metrics.enqueuedFrames += retained.length;
    this.metrics.peakQueuedFrames = Math.max(this.metrics.peakQueuedFrames, this.queueFrames);
    for (const marker of this.inputMarkers) {
      const detection = marker.accept(retained);
      if (detection) {
        this.port.postMessage({
          marker: detection.marker,
          retainedFrames: detection.frames,
          type: "input_marker_retained",
          workletFrame: currentFrame,
        });
      }
    }
  }

  emitNext(output) {
    const next = this.queue.shift();
    if (next) {
      output.set(next);
      this.queueFrames -= next.length;
      this.metrics.emittedFrames += next.length;
      next.fill(0);
      return;
    }
    if (this.finishing && this.postRollRemainingFrames > 0) {
      const emittedPostRollFrames = Math.min(output.length, this.postRollRemainingFrames);
      this.postRollRemainingFrames -= emittedPostRollFrames;
      this.metrics.emittedFrames += emittedPostRollFrames;
    }
  }

  markDrained() {
    if (this.drained) {
      return;
    }
    this.drained = true;
    this.port.postMessage({
      metrics: { ...this.metrics },
      type: "drained",
      workletFrame: currentFrame,
    });
  }
}

class SettaPhase0AudioProbeProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const processorOptions = options.processorOptions ?? {};
    this.markerFrames = positiveInteger(processorOptions.markerFrames, "markerFrames");
    this.markerThreshold = finiteNumber(processorOptions.markerThreshold, "markerThreshold");
    this.markers = [
      new MarkerDetector("prefix", "positive", this.markerThreshold, this.markerFrames),
      new MarkerDetector("tail", "negative", this.markerThreshold, this.markerFrames),
    ];
    this.metrics = {
      contextSampleRate: sampleRate,
      observedFrames: 0,
    };
    this.port.postMessage({
      metrics: { ...this.metrics },
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
      this.metrics.observedFrames += input.length;
      for (const marker of this.markers) {
        const detection = marker.accept(input);
        if (detection) {
          this.port.postMessage({
            marker: detection.marker,
            observedFrames: detection.frames,
            type: "output_marker_observed",
            workletFrame: currentFrame,
          });
        }
      }
    }
    return true;
  }
}

class MarkerDetector {
  constructor(marker, polarity, threshold, requiredFrames) {
    this.marker = marker;
    this.polarity = polarity;
    this.threshold = threshold;
    this.requiredFrames = requiredFrames;
    this.consecutiveFrames = 0;
    this.reported = false;
  }

  accept(samples) {
    if (this.reported) {
      return null;
    }
    for (const sample of samples) {
      if (this.matches(sample)) {
        this.consecutiveFrames += 1;
      } else {
        this.consecutiveFrames = 0;
      }
      if (this.consecutiveFrames >= this.requiredFrames) {
        this.reported = true;
        return { frames: this.consecutiveFrames, marker: this.marker };
      }
    }
    return null;
  }

  matches(sample) {
    return this.polarity === "positive" ? sample >= this.threshold : sample <= -this.threshold;
  }
}

function positiveInteger(value, field) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function finiteNumber(value, field) {
  if (!Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number`);
  }
  return value;
}

registerProcessor("setta-phase0-audio-gate", SettaPhase0AudioGateProcessor);
registerProcessor("setta-phase0-audio-probe", SettaPhase0AudioProbeProcessor);
