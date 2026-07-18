export const bufferedMicrophoneWorkletProcessorName = "setta-buffered-microphone-capture";

export interface BufferedMicrophoneCaptureMetrics {
  capacityFrames: number;
  capturedFrames: number;
  emittedQueuedFrames: number;
  emittedSilenceFrames: number;
  postRollFrames: number;
  queuedFrames: number;
  sampleRate: number;
}

export type BufferedMicrophoneWorkletCommand =
  | { sequence: number; type: "close" }
  | { sequence: number; type: "finish"; postRollFrames?: number }
  | { sequence: number; type: "release" };

export type BufferedMicrophoneWorkletMessage =
  | {
      metrics: BufferedMicrophoneCaptureMetrics;
      sequence: number;
      type: "closed";
      workletFrame: number;
    }
  | {
      capacityFrames: number;
      incomingFrames: number;
      metrics: BufferedMicrophoneCaptureMetrics;
      queuedFrames: number;
      sequence: number;
      type: "overflow";
      workletFrame: number;
    }
  | {
      metrics: BufferedMicrophoneCaptureMetrics;
      sequence: number;
      type: "drained";
      workletFrame: number;
    }
  | {
      message: string;
      metrics: BufferedMicrophoneCaptureMetrics;
      sequence: number;
      type: "error";
      workletFrame: number;
    }
  | {
      metrics: BufferedMicrophoneCaptureMetrics;
      postRollFrames: number;
      queuedFrames: number;
      sequence: number;
      type: "finish_started";
      workletFrame: number;
    }
  | {
      metrics: BufferedMicrophoneCaptureMetrics;
      sequence: number;
      type: "ready";
      workletFrame: number;
    }
  | {
      metrics: BufferedMicrophoneCaptureMetrics;
      queuedFrames: number;
      sequence: number;
      type: "released";
      workletFrame: number;
    };
