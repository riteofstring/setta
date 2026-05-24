import {
  createGpuFlowCommittedSurfaceFrameRenderSignature,
  type GpuFlowCommittedSurfaceFrame,
} from "./committedSurfaceFrame";
import {
  assertGpuFlowCommitPublicationTokenBrand,
  assertGpuFlowCommitPublicationTokenForPresentationProof,
  type GpuFlowCommitPublicationToken,
} from "./GpuFlow/visibleFramePresentationProofs";
import type { GpuFlowVisibleFramePresentationIdentity } from "./GpuFlow/visibleFrameTypes";

type GpuFlowCommittedContentFrame = GpuFlowCommittedSurfaceFrame;

type GpuFlowReactSemanticSnapshot = {
  readonly frame: GpuFlowCommittedContentFrame;
  readonly presentationIdentity: GpuFlowVisibleFramePresentationIdentity | null;
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
  publishCommittedPresentationIdentity(
    token: GpuFlowCommitPublicationToken,
  ): boolean;
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
  private readonly startupFrame: GpuFlowCommittedContentFrame;

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
    assertGpuFlowCommitPublicationTokenForPresentationProof({
      frame,
      token,
    });
    const renderSignature =
      createGpuFlowCommittedSurfaceFrameRenderSignature(frame);
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
    this.emitCommittedFrame();
    if (semanticSnapshotChanged) {
      this.scheduleReactSemanticEmit();
    }
    return renderSignatureChanged;
  }

  publishCommittedPresentationIdentity(
    token: GpuFlowCommitPublicationToken,
  ): boolean {
    assertGpuFlowCommitPublicationTokenBrand({ token });
    assertGpuFlowCommitPublicationTokenForPresentationProof({
      frame: this.getCommittedContentFrame(),
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
      presentationIdentity: null,
      publishCount: this.publishCount,
      renderSignature: createGpuFlowCommittedSurfaceFrameRenderSignature(frame),
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

  private emitCommittedFrame(): void {
    for (const listener of this.committedFrameListeners) {
      listener();
    }
  }
}

function createGpuFlowPresentationIdentityForToken(
  token: GpuFlowCommitPublicationToken,
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
