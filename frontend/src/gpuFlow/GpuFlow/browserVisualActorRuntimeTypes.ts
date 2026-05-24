import type {
  GpuFlowCommittedSurfaceBrowserVisualReadiness,
  GpuFlowCommittedSurfaceDomPresentationEvidence,
} from "../committedSurfaceFrame";
import type { GpuRetainedDomControlSourceDescriptor } from "../retainedDomControlScene";
import type { GpuDomIsland } from "../scene";
import type { GpuViewportInput } from "../viewportMath";
import type { GpuFlowDomControlProjectionAssignment } from "./domControlPlaneProjection";
import type { GpuFlowCommitPublicationToken } from "./visibleFramePresentationProofs";

export type GpuFlowBrowserVisualActorRuntimeFrameIds = {
  readonly committedFrameId: number;
  readonly runtimeFrameId: number;
};

export type GpuFlowBrowserVisualActorRuntimeSnapshot = {
  readonly domControls: {
    readonly assignments: readonly GpuFlowDomControlProjectionAssignment[];
    readonly controlById: ReadonlyMap<
      string,
      GpuRetainedDomControlSourceDescriptor
    >;
    readonly controls: readonly GpuRetainedDomControlSourceDescriptor[];
    readonly mountedControls: readonly GpuRetainedDomControlSourceDescriptor[];
    readonly snapshotControls: readonly GpuRetainedDomControlSourceDescriptor[];
    readonly sourceRevision: string;
  };
  readonly domIslands: {
    readonly islands: readonly GpuDomIsland[];
  };
  readonly frameIds: GpuFlowBrowserVisualActorRuntimeFrameIds;
  readonly publicationToken: GpuFlowCommitPublicationToken | null;
};

export type BrowserVisualActorRuntimeListener = () => void;

export type BrowserVisualActorPreparationHostRenderer = (
  snapshot: GpuFlowBrowserVisualActorRuntimeSnapshot,
) => void;

export type GpuFlowBrowserVisualActorProjectionInput = {
  readonly token: GpuFlowCommitPublicationToken;
  readonly viewport?: GpuViewportInput | undefined;
};

export type GpuFlowBrowserVisualActorCandidate = {
  readonly id: string;
  readonly presentationEvidence: GpuFlowCommittedSurfaceDomPresentationEvidence;
  readonly readiness: GpuFlowCommittedSurfaceBrowserVisualReadiness;
  readonly snapshot: GpuFlowBrowserVisualActorRuntimeSnapshot;
};
