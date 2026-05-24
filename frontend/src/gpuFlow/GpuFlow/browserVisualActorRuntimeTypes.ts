import type {
  GpuFlowPreparedContentBrowserVisualReadiness,
  GpuFlowPreparedContentDomPresentationEvidence,
} from "../preparedContentFrame";
import type { GpuRetainedDomControlSourceDescriptor } from "../retainedDomControlScene";
import type { GpuDomIsland } from "../scene";
import type { GpuViewportInput } from "../viewportMath";
import type { GpuFlowDomControlProjectionAssignment } from "./domControlPlaneProjection";
import type { GpuFlowVisibleFramePresentationToken } from "./visibleFramePresentationProofs";

export type GpuFlowBrowserVisualActorRuntimeFrameIds = {
  readonly preparedContentFrameId: number;
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
  readonly publicationToken: GpuFlowVisibleFramePresentationToken | null;
};

export type BrowserVisualActorRuntimeListener = () => void;

export type BrowserVisualActorPreparationHostRenderer = (
  snapshot: GpuFlowBrowserVisualActorRuntimeSnapshot,
) => void;

export type GpuFlowBrowserVisualActorProjectionInput = {
  readonly token: GpuFlowVisibleFramePresentationToken;
  readonly viewport?: GpuViewportInput | undefined;
};

export type GpuFlowBrowserVisualActorCandidate = {
  readonly id: string;
  readonly presentationEvidence: GpuFlowPreparedContentDomPresentationEvidence;
  readonly readiness: GpuFlowPreparedContentBrowserVisualReadiness;
  readonly snapshot: GpuFlowBrowserVisualActorRuntimeSnapshot;
};
