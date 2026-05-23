import {
  createGpuFlowCommittedSurfaceFrameRenderSignature,
  type GpuFlowCommittedSurfaceFrame,
} from "./committedSurfaceFrame";
import {
  assertGpuFlowCommitPublicationToken,
  assertGpuFlowCommittedSurfaceResetToken,
  assertGpuFlowCommittedSurfaceStartupToken,
  type GpuFlowCommitPublicationToken,
  type GpuFlowCommittedSurfaceResetToken,
  type GpuFlowCommittedSurfaceStartupToken,
} from "./GpuFlow/visibleFramePublicationTokens";

type GpuFlowCommittedContentFrame = GpuFlowCommittedSurfaceFrame;

type GpuFlowReactSemanticSnapshot = {
  readonly frame: GpuFlowCommittedContentFrame;
  readonly publishCount: number;
  readonly renderSignature: string;
};

type GpuFlowCommittedSurfaceRuntimeListener = () => void;

export type GpuFlowCommittedSurfaceRuntime = {
  getCommittedContentFrame(): GpuFlowCommittedContentFrame;
  getReactSemanticSnapshot(): GpuFlowReactSemanticSnapshot;
  publishCommittedContentFrame(
    token: GpuFlowCommitPublicationToken,
    frame: GpuFlowCommittedContentFrame,
  ): boolean;
  resetCommittedContentFrame(token: GpuFlowCommittedSurfaceResetToken): void;
  setStartupFrame(
    token: GpuFlowCommittedSurfaceStartupToken,
    frame: GpuFlowCommittedContentFrame,
  ): void;
  subscribeCommittedContentFrame(
    listener: GpuFlowCommittedSurfaceRuntimeListener,
  ): () => void;
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
  private readonly committedFrameListeners =
    new Set<GpuFlowCommittedSurfaceRuntimeListener>();
  private readonly listeners =
    new Set<GpuFlowCommittedSurfaceRuntimeListener>();
  private publishCount = 0;
  private reactSemanticEmitQueued = false;
  private reactSemanticEmitPending = false;
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

  publishCommittedContentFrame(
    token: GpuFlowCommitPublicationToken,
    frame: GpuFlowCommittedContentFrame,
  ): boolean {
    assertGpuFlowCommitPublicationToken({ frame, token });
    const renderSignature =
      createGpuFlowCommittedSurfaceFrameRenderSignature(frame);
    if (this.semanticSnapshot.renderSignature === renderSignature) {
      this.currentFrame = frame;
      this.emitCommittedFrame();
      return false;
    }
    this.currentFrame = frame;
    this.publishCount += 1;
    this.semanticSnapshot = {
      frame,
      publishCount: this.publishCount,
      renderSignature,
    };
    this.emitCommittedFrame();
    this.scheduleReactSemanticEmit();
    return true;
  }

  resetCommittedContentFrame(token: GpuFlowCommittedSurfaceResetToken): void {
    assertGpuFlowCommittedSurfaceResetToken({ token });
    this.currentFrame = null;
    this.publishCount += 1;
    this.semanticSnapshot = this.createSemanticSnapshot(this.startupFrame);
    this.emitCommittedFrame();
    this.scheduleReactSemanticEmit();
  }

  setStartupFrame(
    token: GpuFlowCommittedSurfaceStartupToken,
    frame: GpuFlowCommittedContentFrame,
  ): void {
    assertGpuFlowCommittedSurfaceStartupToken({ frame, token });
    const previousStartupFrame = this.startupFrame;
    this.startupFrame = frame;
    if (this.currentFrame) {
      return;
    }
    const renderSignature =
      createGpuFlowCommittedSurfaceFrameRenderSignature(frame);
    if (this.semanticSnapshot.renderSignature === renderSignature) {
      if (previousStartupFrame !== frame) {
        this.emitCommittedFrame();
      }
      return;
    }
    this.semanticSnapshot = {
      frame,
      publishCount: this.publishCount,
      renderSignature,
    };
    this.emitCommittedFrame();
  }

  subscribeCommittedContentFrame(
    listener: GpuFlowCommittedSurfaceRuntimeListener,
  ): () => void {
    this.committedFrameListeners.add(listener);
    return () => {
      this.committedFrameListeners.delete(listener);
    };
  }

  subscribeReactSemanticSnapshot(
    listener: GpuFlowCommittedSurfaceRuntimeListener,
  ): () => void {
    this.listeners.add(listener);
    if (this.reactSemanticEmitPending && !this.reactSemanticEmitQueued) {
      this.scheduleReactSemanticEmit();
    }
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

  private scheduleReactSemanticEmit(): void {
    this.reactSemanticEmitPending = true;
    if (this.reactSemanticEmitQueued) {
      return;
    }
    this.reactSemanticEmitQueued = true;
    queueMicrotask(() => {
      this.reactSemanticEmitQueued = false;
      if (this.listeners.size === 0) {
        return;
      }
      this.reactSemanticEmitPending = false;
      this.emitReactSemanticSnapshot();
    });
  }

  private emitReactSemanticSnapshot(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private emitCommittedFrame(): void {
    for (const listener of this.committedFrameListeners) {
      listener();
    }
  }
}
