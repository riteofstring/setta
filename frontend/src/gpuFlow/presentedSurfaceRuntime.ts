import {
  assertGpuFlowVisibleFramePresentationTokenBrand,
  assertGpuFlowVisibleFramePresentationTokenForPresentationProof,
  type GpuFlowVisibleFramePresentationToken,
} from "./GpuFlow/visibleFramePresentationProofs";
import type { GpuFlowVisibleFramePresentationIdentity } from "./GpuFlow/visibleFrameTypes";
import {
  createGpuFlowPreparedContentFrameRenderSignature,
  type GpuFlowPreparedContentFrame,
} from "./preparedContentFrame";

type GpuFlowPresentedContentFrame = GpuFlowPreparedContentFrame;

type GpuFlowReactSemanticSnapshot = {
  readonly frame: GpuFlowPresentedContentFrame;
  readonly presentationIdentity: GpuFlowVisibleFramePresentationIdentity | null;
  readonly publishCount: number;
  readonly renderSignature: string;
};

type GpuFlowPresentedSurfaceRuntimeListener = () => void;

export type GpuFlowPresentedSurfaceRuntime = {
  getPresentedContentFrame(): GpuFlowPresentedContentFrame;
  getReactSemanticSnapshot(): GpuFlowReactSemanticSnapshot;
  publishPresentedContentFrame(
    token: GpuFlowVisibleFramePresentationToken,
    frame: GpuFlowPresentedContentFrame,
  ): boolean;
  publishPresentedProjectionIdentity(
    token: GpuFlowVisibleFramePresentationToken,
  ): boolean;
  subscribePresentedContentFrame(
    listener: GpuFlowPresentedSurfaceRuntimeListener,
  ): () => void;
  subscribeReactSemanticSnapshot(
    listener: GpuFlowPresentedSurfaceRuntimeListener,
  ): () => void;
};

export function createGpuFlowPresentedSurfaceRuntime(
  startupFrame: GpuFlowPresentedContentFrame,
): GpuFlowPresentedSurfaceRuntime {
  return new DefaultGpuFlowPresentedSurfaceRuntime(startupFrame);
}

class DefaultGpuFlowPresentedSurfaceRuntime
  implements GpuFlowPresentedSurfaceRuntime
{
  private currentFrame: GpuFlowPresentedContentFrame | null = null;
  private readonly presentedFrameListeners =
    new Set<GpuFlowPresentedSurfaceRuntimeListener>();
  private readonly listeners =
    new Set<GpuFlowPresentedSurfaceRuntimeListener>();
  private publishCount = 0;
  private reactSemanticEmitQueued = false;
  private reactSemanticEmitPending = false;
  private semanticSnapshot: GpuFlowReactSemanticSnapshot;
  private readonly startupFrame: GpuFlowPresentedContentFrame;

  constructor(startupFrame: GpuFlowPresentedContentFrame) {
    this.startupFrame = startupFrame;
    this.semanticSnapshot = this.createSemanticSnapshot(startupFrame);
  }

  getPresentedContentFrame(): GpuFlowPresentedContentFrame {
    return this.currentFrame ?? this.startupFrame;
  }

  getReactSemanticSnapshot(): GpuFlowReactSemanticSnapshot {
    return this.semanticSnapshot;
  }

  publishPresentedContentFrame(
    token: GpuFlowVisibleFramePresentationToken,
    frame: GpuFlowPresentedContentFrame,
  ): boolean {
    assertGpuFlowVisibleFramePresentationTokenForPresentationProof({
      frame,
      token,
    });
    const renderSignature =
      createGpuFlowPreparedContentFrameRenderSignature(frame);
    const renderSignatureChanged =
      this.semanticSnapshot.renderSignature !== renderSignature;
    const presentationIdentity =
      createGpuFlowPresentationIdentityForToken(token);
    this.currentFrame = frame;
    if (renderSignatureChanged) {
      this.publishCount += 1;
    }
    const semanticSnapshotChanged = this.setReactSemanticSnapshot({
      frame: renderSignatureChanged ? frame : this.semanticSnapshot.frame,
      presentationIdentity,
      publishCount: this.publishCount,
      renderSignature,
    });
    this.emitPresentedFrame();
    if (semanticSnapshotChanged) {
      this.scheduleReactSemanticEmit();
    }
    return renderSignatureChanged;
  }

  publishPresentedProjectionIdentity(
    token: GpuFlowVisibleFramePresentationToken,
  ): boolean {
    assertGpuFlowVisibleFramePresentationTokenBrand({ token });
    assertGpuFlowVisibleFramePresentationTokenForPresentationProof({
      frame: this.getPresentedContentFrame(),
      token,
    });
    const semanticSnapshotChanged = this.setReactSemanticSnapshot({
      ...this.semanticSnapshot,
      presentationIdentity: createGpuFlowPresentationIdentityForToken(token),
    });
    if (semanticSnapshotChanged) {
      this.scheduleReactSemanticEmit();
    }
    return semanticSnapshotChanged;
  }

  subscribePresentedContentFrame(
    listener: GpuFlowPresentedSurfaceRuntimeListener,
  ): () => void {
    this.presentedFrameListeners.add(listener);
    return () => {
      this.presentedFrameListeners.delete(listener);
    };
  }

  subscribeReactSemanticSnapshot(
    listener: GpuFlowPresentedSurfaceRuntimeListener,
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
    frame: GpuFlowPresentedContentFrame,
  ): GpuFlowReactSemanticSnapshot {
    return {
      frame,
      presentationIdentity: null,
      publishCount: this.publishCount,
      renderSignature: createGpuFlowPreparedContentFrameRenderSignature(frame),
    };
  }

  private setReactSemanticSnapshot(
    snapshot: GpuFlowReactSemanticSnapshot,
  ): boolean {
    if (
      areGpuFlowReactSemanticSnapshotsEqual(this.semanticSnapshot, snapshot)
    ) {
      return false;
    }
    this.semanticSnapshot = snapshot;
    return true;
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

  private emitPresentedFrame(): void {
    for (const listener of this.presentedFrameListeners) {
      listener();
    }
  }
}

function createGpuFlowPresentationIdentityForToken(
  token: GpuFlowVisibleFramePresentationToken,
): GpuFlowVisibleFramePresentationIdentity {
  return Object.freeze({
    contentFrameId: token.contentFrameId,
    presentationId: token.presentationId,
    projectionSampleId: token.projectionSampleId,
  });
}

function areGpuFlowReactSemanticSnapshotsEqual(
  left: GpuFlowReactSemanticSnapshot,
  right: GpuFlowReactSemanticSnapshot,
): boolean {
  return (
    left.frame === right.frame &&
    areGpuFlowPresentationIdentitiesEqual(
      left.presentationIdentity,
      right.presentationIdentity,
    ) &&
    left.publishCount === right.publishCount &&
    left.renderSignature === right.renderSignature
  );
}

function areGpuFlowPresentationIdentitiesEqual(
  left: GpuFlowVisibleFramePresentationIdentity | null,
  right: GpuFlowVisibleFramePresentationIdentity | null,
): boolean {
  return (
    left === right ||
    (left !== null &&
      right !== null &&
      left.contentFrameId === right.contentFrameId &&
      left.presentationId === right.presentationId &&
      left.projectionSampleId === right.projectionSampleId)
  );
}
