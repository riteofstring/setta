import {
  createGpuFlowCommittedSurfaceFrameRenderSignature,
  type GpuFlowCommittedSurfaceFrame,
} from "./committedSurfaceFrame";
import type { GpuRetainedContentScrollOffsetMap } from "./retainedContentScroll";
import type { GpuViewportInput } from "./viewportMath";

export type GpuFlowCommittedContentFrame = GpuFlowCommittedSurfaceFrame;

export type GpuFlowLiveProjectionSample = {
  readonly retainedScrollOffsets: GpuRetainedContentScrollOffsetMap;
  readonly sampleId: number;
  readonly viewport: GpuViewportInput;
};

export type GpuFlowProjectionFrame = {
  readonly committedContentFrameId: number;
  readonly id: number;
  readonly projectedAtMs: number;
  readonly sample: GpuFlowLiveProjectionSample;
};

export type GpuFlowReactSemanticSnapshot = {
  readonly frame: GpuFlowCommittedContentFrame;
  readonly publishCount: number;
  readonly renderSignature: string;
};

type GpuFlowCommittedSurfaceRuntimeListener = () => void;

export type GpuFlowCommittedSurfaceRuntime = {
  getCommittedContentFrame(): GpuFlowCommittedContentFrame;
  getReactSemanticSnapshot(): GpuFlowReactSemanticSnapshot;
  publishCommittedContentFrame(frame: GpuFlowCommittedContentFrame): boolean;
  resetCommittedContentFrame(): void;
  setStartupFrame(frame: GpuFlowCommittedContentFrame): void;
  subscribeReactSemanticSnapshot(
    listener: GpuFlowCommittedSurfaceRuntimeListener,
  ): () => void;
};

export function createGpuFlowCommittedSurfaceRuntime(
  startupFrame: GpuFlowCommittedContentFrame,
): GpuFlowCommittedSurfaceRuntime {
  return new DefaultGpuFlowCommittedSurfaceRuntime(startupFrame);
}

class DefaultGpuFlowCommittedSurfaceRuntime
  implements GpuFlowCommittedSurfaceRuntime
{
  private currentFrame: GpuFlowCommittedContentFrame | null = null;
  private readonly listeners =
    new Set<GpuFlowCommittedSurfaceRuntimeListener>();
  private publishCount = 0;
  private semanticSnapshot: GpuFlowReactSemanticSnapshot;
  private startupFrame: GpuFlowCommittedContentFrame;

  constructor(startupFrame: GpuFlowCommittedContentFrame) {
    this.startupFrame = startupFrame;
    this.semanticSnapshot = this.createSemanticSnapshot(startupFrame);
  }

  getCommittedContentFrame(): GpuFlowCommittedContentFrame {
    return this.currentFrame ?? this.startupFrame;
  }

  getReactSemanticSnapshot(): GpuFlowReactSemanticSnapshot {
    return this.semanticSnapshot;
  }

  publishCommittedContentFrame(frame: GpuFlowCommittedContentFrame): boolean {
    const renderSignature =
      createGpuFlowCommittedSurfaceFrameRenderSignature(frame);
    if (this.semanticSnapshot.renderSignature === renderSignature) {
      this.currentFrame = frame;
      return false;
    }
    this.currentFrame = frame;
    this.publishCount += 1;
    this.semanticSnapshot = {
      frame,
      publishCount: this.publishCount,
      renderSignature,
    };
    this.emit();
    return true;
  }

  resetCommittedContentFrame(): void {
    this.currentFrame = null;
    this.publishCount += 1;
    this.semanticSnapshot = this.createSemanticSnapshot(this.startupFrame);
    this.emit();
  }

  setStartupFrame(frame: GpuFlowCommittedContentFrame): void {
    this.startupFrame = frame;
    if (this.currentFrame) {
      return;
    }
    const renderSignature =
      createGpuFlowCommittedSurfaceFrameRenderSignature(frame);
    if (this.semanticSnapshot.renderSignature === renderSignature) {
      return;
    }
    this.semanticSnapshot = {
      frame,
      publishCount: this.publishCount,
      renderSignature,
    };
  }

  subscribeReactSemanticSnapshot(
    listener: GpuFlowCommittedSurfaceRuntimeListener,
  ): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private createSemanticSnapshot(
    frame: GpuFlowCommittedContentFrame,
  ): GpuFlowReactSemanticSnapshot {
    return {
      frame,
      publishCount: this.publishCount,
      renderSignature: createGpuFlowCommittedSurfaceFrameRenderSignature(frame),
    };
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
