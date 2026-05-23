const GPU_FLOW_CONTENT_FRAME_ID = Symbol("GpuFlowContentFrameId");
const GPU_FLOW_PRESENTATION_ID = Symbol("GpuFlowPresentationId");

type GpuFlowContentFrameIdBrand = {
  readonly [GPU_FLOW_CONTENT_FRAME_ID]: true;
};

type GpuFlowPresentationIdBrand = {
  readonly [GPU_FLOW_PRESENTATION_ID]: true;
};

export type GpuFlowContentFrameId = string & GpuFlowContentFrameIdBrand;
export type GpuFlowPresentationId = string & GpuFlowPresentationIdBrand;
export type GpuFlowProjectionSampleId = string | number;

export const GPU_FLOW_BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID =
  "cold-start-shell:browser-visual";
export const GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID =
  "cold-start-shell:retained-projection";

export type GpuFlowColdStartShellFrameId =
  | typeof GPU_FLOW_BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID
  | typeof GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID;

export type GpuFlowColdStartShellFrame = {
  readonly id: GpuFlowColdStartShellFrameId;
  readonly input: "disabled";
  readonly kind: "cold-start-shell";
  readonly reason: string;
};

export type GpuFlowVisibleFrameActorFamily =
  | "browser-visual"
  | "dom-island"
  | "hit-debug"
  | "html-texture"
  | "native-visual"
  | "resource-maintenance"
  | "retained-page";

export type GpuFlowVisibleFrameActorKey = {
  readonly actorId: string;
  readonly family: GpuFlowVisibleFrameActorFamily;
};

export type GpuFlowVisibleFrameDebt = {
  readonly browserVisual: boolean;
  readonly content: boolean;
  readonly maintenance: boolean;
  readonly motion: boolean;
};

export type GpuFlowVisibleFrameActorRequirement = "maintenance" | "required";

export type GpuFlowRetainedPageCompatiblePreviousProof = {
  readonly candidateContentFrameId: GpuFlowContentFrameId;
  readonly candidateProjectionSampleId: GpuFlowProjectionSampleId;
  readonly clipChainGeneration: string;
  readonly dpr: number;
  readonly pageCoverageKey: string;
  readonly previousContentFrameId: GpuFlowContentFrameId;
  readonly previousPresentationId: GpuFlowPresentationId;
  readonly retainedDisplayManifestId: string;
  readonly retainedScrollProjectionGeneration: string;
  readonly retainedContentGeneration: string;
  readonly visibleTrueHoleCount: 0;
  readonly zoomBucket: string;
};

export type GpuFlowBrowserVisualCompatiblePreviousProof = {
  readonly activeEditorState?:
    | {
        readonly focusPreserved: true;
        readonly hostId: string;
        readonly selectionPreserved: true;
        readonly transferKind: "same-host-transform" | "same-actor-transfer";
      }
    | undefined;
  readonly actorId: string;
  readonly browserVisualGeneration: string;
  readonly candidateContentFrameId: GpuFlowContentFrameId;
  readonly candidateProjectionSampleId: GpuFlowProjectionSampleId;
  readonly clipChainGeneration: string;
  readonly previousContentFrameId: GpuFlowContentFrameId;
  readonly previousPresentationId: GpuFlowPresentationId;
  readonly representationKind: "active-editor" | "live-dom" | "snapshot";
  readonly resourceId: string;
  readonly scrollProjectionGeneration: string;
  readonly semanticGeneration: string;
  readonly sourceRect: GpuFlowVisibleFrameRect;
  readonly visibleClip: GpuFlowVisibleFrameRect;
};

export type GpuFlowVisibleFrameCompatiblePreviousProof =
  | {
      readonly family: "browser-visual";
      readonly proof: GpuFlowBrowserVisualCompatiblePreviousProof;
    }
  | {
      readonly family: "retained-page";
      readonly proof: GpuFlowRetainedPageCompatiblePreviousProof;
    };

export type GpuFlowVisibleFrameRect = {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
};

type GpuFlowVisibleFrameActorProofBase = GpuFlowVisibleFrameActorKey & {
  readonly requirement: GpuFlowVisibleFrameActorRequirement;
};

export type GpuFlowVisibleFrameActorProof =
  | (GpuFlowVisibleFrameActorProofBase & {
      readonly proof: "blocked";
      readonly reason: string;
    })
  | (GpuFlowVisibleFrameActorProofBase & {
      readonly compatiblePreviousProof: GpuFlowVisibleFrameCompatiblePreviousProof;
      readonly proof: "compatible-previous";
    })
  | (GpuFlowVisibleFrameActorProofBase & {
      readonly generationId: string;
      readonly proof: "exact";
    })
  | (GpuFlowVisibleFrameActorProofBase & {
      readonly proof: "true-hole";
      readonly reason: string;
      readonly trueHoleCount: number;
    });

export type GpuFlowVisibleFrameCommittedActorCoverage =
  GpuFlowVisibleFrameActorKey & {
    readonly compatibleContentFrameIds: readonly GpuFlowContentFrameId[];
    readonly contentFrameId: GpuFlowContentFrameId;
    readonly coversCandidateProjection: boolean;
    readonly presentationId: GpuFlowPresentationId;
  };

export type GpuFlowVisibleFrameCommittedPresentation = {
  readonly actorCoverages: readonly GpuFlowVisibleFrameCommittedActorCoverage[];
  readonly contentFrameId: GpuFlowContentFrameId;
  readonly presentationId: GpuFlowPresentationId;
};

export type GpuFlowVisibleFrameCandidate = {
  readonly actorProofs: readonly GpuFlowVisibleFrameActorProof[];
  readonly contentFrameId: GpuFlowContentFrameId;
  readonly preparedResourceIds: readonly string[];
  readonly projectionSampleId: GpuFlowProjectionSampleId;
  readonly queuedDebt: GpuFlowVisibleFrameDebt;
  readonly requiredActors: readonly GpuFlowVisibleFrameActorKey[];
};

export function createGpuFlowContentFrameId(id: string): GpuFlowContentFrameId {
  if (id.length === 0) {
    throw new Error("GPU Flow content frame id cannot be empty.");
  }
  return id as GpuFlowContentFrameId;
}

export function createGpuFlowPresentationId(id: string): GpuFlowPresentationId {
  if (id.length === 0) {
    throw new Error("GPU Flow presentation id cannot be empty.");
  }
  return id as GpuFlowPresentationId;
}

export function createGpuFlowVisibleFrameActorKey(
  actor: GpuFlowVisibleFrameActorKey,
): string {
  return `${actor.family}:${actor.actorId}`;
}
