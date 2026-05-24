import type {
  GpuFlowCommittedSurfaceActorGeneration,
  GpuFlowCommittedSurfaceFrame,
} from "../committedSurfaceFrame";
import type { GpuFlowLiveProjectionSample } from "../projectionRuntime";
import {
  getGpuFlowBrowserStyleBlockedReasonFamily,
  getGpuFlowBrowserStyleVisibleFrameActorFamily,
  type GpuFlowBrowserStyleVisibleFrameActorFamily,
} from "./visibleFrameActorRegistry";
import type { GpuFlowBlockedVisibleReason } from "./visibleFramePresentationProofs";
import { createGpuFlowMissingSectionStructureActorManifestEntries } from "./visibleFrameSectionActorManifest";
import {
  createGpuFlowContentFrameId,
  createGpuFlowPresentationId,
  createGpuFlowVisibleFrameActorKey,
  type GpuFlowContentFrameId,
  type GpuFlowPresentationId,
  type GpuFlowProjectionSampleId,
  type GpuFlowVisibleFrameActorKey,
  type GpuFlowVisibleFrameActorProof,
  type GpuFlowVisibleFrameCommittedActorCoverage,
  type GpuFlowVisibleFrameRect,
} from "./visibleFrameTypes";

export type GpuFlowVisibleFrameResourceStateName =
  | "absent"
  | "preparing"
  | "presented"
  | "ready"
  | "requested"
  | "retired";

type GpuFlowVisibleFrameManifestActorRequirement =
  | "explicitly-absent"
  | "maintenance"
  | "required";

type GpuFlowVisibleFrameManifestActorSource =
  | "blocked-reason"
  | "committed-actor"
  | "presentation";

export type GpuFlowVisibleFrameActorManifestEntry =
  GpuFlowVisibleFrameActorKey & {
    readonly absentReason: string | null;
    readonly acceptableCoverage: readonly ("compatible-previous" | "exact")[];
    readonly clipChain: string;
    readonly contentGeneration: string;
    readonly desiredRect: GpuFlowVisibleFrameRect | null;
    readonly lastPresentedCompatibleResource: string | null;
    readonly projectionGeneration: string;
    readonly readinessProof: string;
    readonly requirement: GpuFlowVisibleFrameManifestActorRequirement;
    readonly resourceState: GpuFlowVisibleFrameResourceStateName;
    readonly source: GpuFlowVisibleFrameManifestActorSource;
    readonly zOrder: number;
  };

export type GpuFlowVisibleFrameActorManifest = {
  readonly blockedReasons: readonly GpuFlowBlockedVisibleReason[];
  readonly entries: readonly GpuFlowVisibleFrameActorManifestEntry[];
  readonly requiredActors: readonly GpuFlowVisibleFrameActorKey[];
};

type GpuFlowVisibleFrameBrowserRepresentationKind =
  | "active-editor"
  | "live-dom"
  | "snapshot";

type GpuFlowVisibleFrameBrowserActorFamily = Extract<
  GpuFlowBrowserStyleVisibleFrameActorFamily,
  "active-editor" | "browser-text-control" | "browser-text-snapshot"
>;

type GpuFlowVisibleFrameTextProjectionCoverage = NonNullable<
  GpuFlowCommittedSurfaceActorGeneration["textCoverageProof"]
>["projectionCoverage"];

type GpuFlowVisibleFramePresentationGeneration = {
  readonly contentGeneration: string;
  readonly projectionGeneration: string;
  readonly readinessProof: string;
};

type GpuFlowVisibleFramePresentationGenerationFactory = (input: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly sample: GpuFlowLiveProjectionSample | null;
}) => GpuFlowVisibleFramePresentationGeneration;

const GPU_FLOW_PRESENTATION_ACTOR_FAMILIES = Object.freeze([
  "scene-background",
  "grid",
  "edges",
  "viewport-portal",
  "hit-generation",
  "accessibility-exposure",
  "debug-snapshot",
  "public-runtime-state",
] as const satisfies readonly GpuFlowBrowserStyleVisibleFrameActorFamily[]);

const GPU_FLOW_PRESENTATION_ACTOR_Z_ORDER = Object.freeze({
  "accessibility-exposure": 11000,
  "debug-snapshot": 12000,
  edges: -1000,
  grid: -2000,
  "hit-generation": 10000,
  "public-runtime-state": 13000,
  "scene-background": -3000,
  "viewport-portal": 9000,
} satisfies Record<
  (typeof GPU_FLOW_PRESENTATION_ACTOR_FAMILIES)[number],
  number
>);

const GPU_FLOW_VISIBLE_FRAME_TEXT_COVERAGE_RESOURCE_STATE = Object.freeze({
  "blocked-awaiting-browser-visual": "preparing",
  "blocked-awaiting-live-host": "preparing",
  "compatible-previous": "presented",
  "true-hole": "absent",
} satisfies Partial<
  Record<
    GpuFlowVisibleFrameTextProjectionCoverage,
    GpuFlowVisibleFrameResourceStateName
  >
>);

const GPU_FLOW_PRESENTATION_GENERATION_FACTORIES = Object.freeze({
  "accessibility-exposure": createGpuFlowAccessibilityExposureGeneration,
  "debug-snapshot": createGpuFlowDebugSnapshotGeneration,
  edges: createGpuFlowEdgesGeneration,
  grid: createGpuFlowGridGeneration,
  "hit-generation": createGpuFlowHitGenerationGeneration,
  "public-runtime-state": createGpuFlowPublicRuntimeStateGeneration,
  "scene-background": createGpuFlowSceneBackgroundGeneration,
  "viewport-portal": createGpuFlowViewportPortalGeneration,
} satisfies Record<
  (typeof GPU_FLOW_PRESENTATION_ACTOR_FAMILIES)[number],
  GpuFlowVisibleFramePresentationGenerationFactory
>);

export function createGpuFlowVisibleFrameActorManifest({
  blockedReasons = [],
  frame,
  sample = null,
}: {
  readonly blockedReasons?: readonly GpuFlowBlockedVisibleReason[] | undefined;
  readonly frame: GpuFlowCommittedSurfaceFrame | null;
  readonly sample?: GpuFlowLiveProjectionSample | null | undefined;
}): GpuFlowVisibleFrameActorManifest {
  const entryByKey = new Map<string, GpuFlowVisibleFrameActorManifestEntry>();
  if (frame === null) {
    if (blockedReasons.length === 0) {
      setGpuFlowVisibleFrameActorManifestEntry({
        entry: createGpuFlowVisibleFrameSyntheticBlockedManifestEntry({
          actorId: "visible-frame",
          family: "retained-page",
          reason: "no-visible-frame",
        }),
        entryByKey,
      });
    }
  } else {
    for (const entry of createGpuFlowVisibleFramePresentationManifestEntries({
      frame,
      sample,
    })) {
      setGpuFlowVisibleFrameActorManifestEntry({ entry, entryByKey });
    }
    for (const actor of frame.actorGenerations ?? []) {
      if (!actor.visibleNonempty) {
        continue;
      }
      setGpuFlowVisibleFrameActorManifestEntry({
        entry: createGpuFlowVisibleFrameCommittedActorManifestEntry(actor),
        entryByKey,
      });
    }
    addGpuFlowMissingSectionStructureActorManifestEntries({
      entryByKey,
      frame,
    });
  }
  blockedReasons.forEach((reason, index) => {
    const actor = createGpuFlowVisibleFrameActorKeyForBlockedReason({
      index,
      reason,
    });
    const key = createGpuFlowVisibleFrameActorKey(actor);
    if (entryByKey.has(key)) {
      return;
    }
    setGpuFlowVisibleFrameActorManifestEntry({
      entry: createGpuFlowVisibleFrameSyntheticBlockedManifestEntry({
        ...actor,
        reason: reason.reason,
      }),
      entryByKey,
    });
  });
  const entries = Object.freeze([...entryByKey.values()]);
  return Object.freeze({
    blockedReasons: Object.freeze([...blockedReasons]),
    entries,
    requiredActors: Object.freeze(
      entries
        .filter((entry) => entry.requirement === "required")
        .map(({ actorId, family }) =>
          Object.freeze({
            actorId,
            family,
          }),
        ),
    ),
  });
}

function addGpuFlowMissingSectionStructureActorManifestEntries({
  entryByKey,
  frame,
}: {
  readonly entryByKey: Map<string, GpuFlowVisibleFrameActorManifestEntry>;
  readonly frame: GpuFlowCommittedSurfaceFrame;
}): void {
  for (const missingActor of createGpuFlowMissingSectionStructureActorManifestEntries(
    frame,
  )) {
    setGpuFlowVisibleFrameActorManifestEntry({
      entry: createGpuFlowVisibleFrameSyntheticBlockedManifestEntry(
        missingActor,
      ),
      entryByKey,
    });
  }
}

export function createGpuFlowVisibleFrameActorProofsForManifest({
  contentFrameId,
  frame,
  manifest,
  projectionSampleId,
}: {
  readonly contentFrameId: GpuFlowContentFrameId;
  readonly frame: GpuFlowCommittedSurfaceFrame | null;
  readonly manifest: GpuFlowVisibleFrameActorManifest;
  readonly projectionSampleId: GpuFlowProjectionSampleId;
}): readonly GpuFlowVisibleFrameActorProof[] {
  const proofByActor = new Map<string, GpuFlowVisibleFrameActorProof>();
  for (const actor of frame?.actorGenerations ?? []) {
    if (!actor.visibleNonempty) {
      continue;
    }
    setGpuFlowVisibleFrameActorProof({
      proof: createGpuFlowVisibleFrameActorProof({
        actor,
        contentFrameId,
        projectionSampleId,
      }),
      proofByActor,
    });
  }
  for (const entry of manifest.entries) {
    if (entry.source !== "presentation") {
      continue;
    }
    setGpuFlowVisibleFrameActorProof({
      proof: createGpuFlowVisibleFramePresentationActorProof(entry),
      proofByActor,
    });
  }
  manifest.blockedReasons.forEach((reason, index) => {
    setGpuFlowVisibleFrameActorProof({
      proof: createGpuFlowVisibleFrameSyntheticBlockedProof({
        ...createGpuFlowVisibleFrameActorKeyForBlockedReason({ index, reason }),
        reason: reason.reason,
      }),
      proofByActor,
    });
  });
  for (const entry of manifest.entries) {
    if (entry.source !== "blocked-reason") {
      continue;
    }
    setGpuFlowVisibleFrameActorProof({
      proof: createGpuFlowVisibleFrameSyntheticBlockedProof({
        actorId: entry.actorId,
        family: entry.family,
        reason: entry.readinessProof,
      }),
      proofByActor,
    });
  }
  return Object.freeze([...proofByActor.values()]);
}

export function createGpuFlowVisibleFrameCommittedActorCoverageForManifest({
  candidateContentFrameId,
  contentFrameId,
  coversCandidateProjection,
  manifest,
  presentationId,
}: {
  readonly candidateContentFrameId: GpuFlowContentFrameId;
  readonly contentFrameId: GpuFlowContentFrameId;
  readonly coversCandidateProjection: boolean;
  readonly manifest: GpuFlowVisibleFrameActorManifest;
  readonly presentationId: GpuFlowPresentationId;
}): readonly GpuFlowVisibleFrameCommittedActorCoverage[] {
  return Object.freeze(
    manifest.requiredActors.map((actor) =>
      Object.freeze({
        ...actor,
        compatibleContentFrameIds:
          contentFrameId === candidateContentFrameId
            ? Object.freeze([candidateContentFrameId])
            : Object.freeze([]),
        contentFrameId,
        coversCandidateProjection,
        presentationId,
      }),
    ),
  );
}

function createGpuFlowVisibleFramePresentationManifestEntries({
  frame,
  sample,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly sample: GpuFlowLiveProjectionSample | null;
}): readonly GpuFlowVisibleFrameActorManifestEntry[] {
  return GPU_FLOW_PRESENTATION_ACTOR_FAMILIES.map((family) =>
    createGpuFlowVisibleFramePresentationManifestEntry({
      family,
      frame,
      sample,
    }),
  );
}

function createGpuFlowVisibleFramePresentationManifestEntry({
  family,
  frame,
  sample,
}: {
  readonly family: (typeof GPU_FLOW_PRESENTATION_ACTOR_FAMILIES)[number];
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly sample: GpuFlowLiveProjectionSample | null;
}): GpuFlowVisibleFrameActorManifestEntry {
  const generation = createGpuFlowVisibleFramePresentationGeneration({
    family,
    frame,
    sample,
  });
  return Object.freeze({
    absentReason: null,
    acceptableCoverage: Object.freeze(["exact" as const]),
    actorId: family,
    clipChain:
      frame.coherence?.clipChainRevision ?? `clip:${frame.displayFrameId}`,
    contentGeneration: generation.contentGeneration,
    desiredRect: createGpuFlowVisibleFrameViewportRect({ frame, sample }),
    family,
    lastPresentedCompatibleResource: null,
    projectionGeneration: generation.projectionGeneration,
    readinessProof: generation.readinessProof,
    requirement: "required" as const,
    resourceState: "ready" as const,
    source: "presentation" as const,
    zOrder: getGpuFlowVisibleFramePresentationActorZOrder(family),
  });
}

function createGpuFlowHitGenerationGeneration({
  frame,
  sample,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly sample: GpuFlowLiveProjectionSample | null;
}): GpuFlowVisibleFramePresentationGeneration {
  return {
    contentGeneration:
      frame.coherence?.hitGenerationId ?? `hit:${frame.displayFrameId}`,
    projectionGeneration: `hit:${sample?.id ?? frame.displayFrameId}`,
    readinessProof: "hit-generation-ready",
  };
}

function createGpuFlowAccessibilityExposureGeneration({
  frame,
  sample,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly sample: GpuFlowLiveProjectionSample | null;
}): GpuFlowVisibleFramePresentationGeneration {
  const domGeneration = frame.presentationProof?.domGeneration;
  return {
    contentGeneration: getGpuFlowAccessibilityExposureContentGeneration({
      domGeneration,
      frame,
    }),
    projectionGeneration: `accessibility:${sample?.id ?? frame.displayFrameId}`,
    readinessProof: getGpuFlowAccessibilityExposureReadinessProof(
      domGeneration,
    ),
  };
}

function getGpuFlowAccessibilityExposureContentGeneration({
  domGeneration,
  frame,
}: {
  readonly domGeneration:
    | NonNullable<
        GpuFlowCommittedSurfaceFrame["presentationProof"]
      >["domGeneration"]
    | undefined;
  readonly frame: GpuFlowCommittedSurfaceFrame;
}): string {
  return (
    domGeneration?.presentationBatchId ??
    `accessibility:${frame.displayFrameId}`
  );
}

function getGpuFlowAccessibilityExposureReadinessProof(
  domGeneration:
    | NonNullable<
        GpuFlowCommittedSurfaceFrame["presentationProof"]
      >["domGeneration"]
    | undefined,
): string {
  return (domGeneration?.exposable ?? true) && (domGeneration?.staged ?? true)
    ? "browser-dom-exposable"
    : "browser-dom-not-exposable";
}

function createGpuFlowDebugSnapshotGeneration({
  frame,
  sample,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly sample: GpuFlowLiveProjectionSample | null;
}): GpuFlowVisibleFramePresentationGeneration {
  return {
    contentGeneration: String(
      frame.coherence?.debugSnapshotFrameId ?? frame.displayFrameId,
    ),
    projectionGeneration: `debug:${sample?.id ?? frame.displayFrameId}`,
    readinessProof: "debug-snapshot-ready",
  };
}

function createGpuFlowPublicRuntimeStateGeneration({
  frame,
  sample,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly sample: GpuFlowLiveProjectionSample | null;
}): GpuFlowVisibleFramePresentationGeneration {
  return {
    contentGeneration:
      frame.presentationProof?.batchId ?? `public:${frame.displayFrameId}`,
    projectionGeneration: `public:${sample?.id ?? frame.displayFrameId}`,
    readinessProof: "public-runtime-state-ready",
  };
}

function createGpuFlowViewportPortalGeneration({
  frame,
  sample,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly sample: GpuFlowLiveProjectionSample | null;
}): GpuFlowVisibleFramePresentationGeneration {
  return {
    contentGeneration: String(frame.displayFrameId),
    projectionGeneration: `viewport:${sample?.id ?? frame.displayFrameId}`,
    readinessProof: "viewport-portal-ready",
  };
}

function createGpuFlowEdgesGeneration({
  frame,
  sample,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly sample: GpuFlowLiveProjectionSample | null;
}): GpuFlowVisibleFramePresentationGeneration {
  return {
    contentGeneration: `edges:${frame.sceneRevision ?? 0}`,
    projectionGeneration: `edges:${sample?.id ?? frame.displayFrameId}`,
    readinessProof: "edges-ready",
  };
}

function createGpuFlowGridGeneration({
  frame,
  sample,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly sample: GpuFlowLiveProjectionSample | null;
}): GpuFlowVisibleFramePresentationGeneration {
  return {
    contentGeneration: `grid:${frame.sceneRevision ?? 0}`,
    projectionGeneration: `grid:${sample?.id ?? frame.displayFrameId}`,
    readinessProof: "grid-ready",
  };
}

function createGpuFlowSceneBackgroundGeneration({
  frame,
  sample,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly sample: GpuFlowLiveProjectionSample | null;
}): GpuFlowVisibleFramePresentationGeneration {
  return {
    contentGeneration: `scene-background:${frame.sceneRevision ?? 0}`,
    projectionGeneration: `scene-background:${sample?.id ?? frame.displayFrameId}`,
    readinessProof: "scene-background-ready",
  };
}

function createGpuFlowVisibleFramePresentationGeneration({
  family,
  frame,
  sample,
}: {
  readonly family: GpuFlowBrowserStyleVisibleFrameActorFamily;
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly sample: GpuFlowLiveProjectionSample | null;
}): GpuFlowVisibleFramePresentationGeneration {
  const factory = (
    GPU_FLOW_PRESENTATION_GENERATION_FACTORIES as Partial<
      Record<
        GpuFlowBrowserStyleVisibleFrameActorFamily,
        GpuFlowVisibleFramePresentationGenerationFactory
      >
    >
  )[family];
  if (!factory) {
    throw new Error(
      `Unsupported GPU Flow presentation actor family "${family}".`,
    );
  }
  return factory({ frame, sample });
}

function getGpuFlowVisibleFramePresentationActorZOrder(
  family: GpuFlowBrowserStyleVisibleFrameActorFamily,
): number {
  return (
    (
      GPU_FLOW_PRESENTATION_ACTOR_Z_ORDER as Partial<
        Record<GpuFlowBrowserStyleVisibleFrameActorFamily, number>
      >
    )[family] ?? 0
  );
}

function createGpuFlowVisibleFrameCommittedActorManifestEntry(
  actor: GpuFlowCommittedSurfaceActorGeneration,
): GpuFlowVisibleFrameActorManifestEntry {
  const family = getGpuFlowBrowserStyleVisibleFrameActorFamily(actor);
  return Object.freeze({
    absentReason: null,
    acceptableCoverage: getGpuFlowVisibleFrameActorAcceptableCoverage(family),
    actorId: actor.actorId,
    clipChain: actor.clipChainRevision,
    contentGeneration: actor.contentGenerationId,
    desiredRect: createGpuFlowVisibleFrameRect(
      actor.flowRect ?? actor.clipRect ?? actor.sourceRect,
    ),
    family,
    lastPresentedCompatibleResource:
      actor.textCoverageProof?.projectionCoverage === "compatible-previous"
        ? actor.textCoverageProof.compatiblePreviousProof.resourceHandles[0]
            ?.id ??
          actor.textCoverageProof.compatiblePreviousProof
            .protectedResourceIds[0] ??
          null
        : null,
    projectionGeneration: actor.layoutProjectionGenerationId,
    readinessProof: actor.readinessGenerationId,
    requirement: "required" as const,
    resourceState: getGpuFlowVisibleFrameActorResourceState(actor),
    source: "committed-actor" as const,
    zOrder: actor.zOrder,
  });
}

function getGpuFlowVisibleFrameActorAcceptableCoverage(
  family: GpuFlowBrowserStyleVisibleFrameActorFamily,
): readonly ("compatible-previous" | "exact")[] {
  if (family === "active-editor") {
    return Object.freeze(["exact" as const]);
  }
  if (
    family === "browser-text-control" ||
    family === "browser-text-snapshot" ||
    family === "retained-page"
  ) {
    return Object.freeze(["exact" as const, "compatible-previous" as const]);
  }
  return Object.freeze(["exact" as const]);
}

function getGpuFlowVisibleFrameActorResourceState(
  actor: GpuFlowCommittedSurfaceActorGeneration,
): GpuFlowVisibleFrameResourceStateName {
  const coverageState = actor.textCoverageProof?.projectionCoverage;
  const resourceState = coverageState
    ? GPU_FLOW_VISIBLE_FRAME_TEXT_COVERAGE_RESOURCE_STATE[coverageState]
    : undefined;
  if (resourceState) {
    return resourceState;
  }
  return getGpuFlowVisibleFrameMountResourceState(actor);
}

function getGpuFlowVisibleFrameMountResourceState(
  actor: Pick<GpuFlowCommittedSurfaceActorGeneration, "mountReadiness">,
): GpuFlowVisibleFrameResourceStateName {
  return actor.mountReadiness === "ready" ||
    actor.mountReadiness === "not-required"
    ? "ready"
    : "requested";
}

function createGpuFlowVisibleFrameSyntheticBlockedManifestEntry({
  actorId,
  family,
  reason,
}: GpuFlowVisibleFrameActorKey & {
  readonly reason: string;
}): GpuFlowVisibleFrameActorManifestEntry {
  return Object.freeze({
    absentReason: null,
    acceptableCoverage: Object.freeze(["exact" as const]),
    actorId,
    clipChain: "blocked",
    contentGeneration: "blocked",
    desiredRect: null,
    family,
    lastPresentedCompatibleResource: null,
    projectionGeneration: "blocked",
    readinessProof: reason,
    requirement: "required" as const,
    resourceState: "preparing" as const,
    source: "blocked-reason" as const,
    zOrder: 0,
  });
}

function createGpuFlowVisibleFrameActorProof({
  actor,
  contentFrameId,
  projectionSampleId,
}: {
  readonly actor: GpuFlowCommittedSurfaceActorGeneration;
  readonly contentFrameId: GpuFlowContentFrameId;
  readonly projectionSampleId: GpuFlowProjectionSampleId;
}): GpuFlowVisibleFrameActorProof {
  const actorKey = createGpuFlowVisibleFrameActorProofKey(actor);
  const textCoverage = actor.textCoverageProof;
  switch (textCoverage?.projectionCoverage) {
    case "true-hole":
      return createGpuFlowVisibleFrameTrueHoleProof({
        actorKey,
        reason: textCoverage.readinessReason,
      });
    case "blocked-awaiting-browser-visual":
    case "blocked-awaiting-live-host":
      return createGpuFlowVisibleFrameBlockedActorProof({
        actorKey,
        reason: textCoverage.readinessReason,
      });
    case "compatible-previous":
      return createGpuFlowVisibleFrameCompatiblePreviousOrBlockedProof({
        actor,
        actorKey,
        contentFrameId,
        projectionSampleId,
      });
    case "exact-live-dom":
    case "exact-snapshot":
    case undefined:
      return Object.freeze({
        ...actorKey,
        generationId: actor.generationId,
        proof: "exact" as const,
        requirement: "required" as const,
      });
  }
}

function createGpuFlowVisibleFrameTrueHoleProof({
  actorKey,
  reason,
}: {
  readonly actorKey: GpuFlowVisibleFrameActorKey;
  readonly reason: string;
}): GpuFlowVisibleFrameActorProof {
  return Object.freeze({
    ...actorKey,
    proof: "true-hole" as const,
    reason,
    requirement: "required" as const,
    trueHoleCount: 1,
  });
}

function createGpuFlowVisibleFrameBlockedActorProof({
  actorKey,
  reason,
}: {
  readonly actorKey: GpuFlowVisibleFrameActorKey;
  readonly reason: string;
}): GpuFlowVisibleFrameActorProof {
  return Object.freeze({
    ...actorKey,
    proof: "blocked" as const,
    reason,
    requirement: "required" as const,
  });
}

function createGpuFlowVisibleFrameCompatiblePreviousOrBlockedProof({
  actor,
  actorKey,
  contentFrameId,
  projectionSampleId,
}: {
  readonly actor: GpuFlowCommittedSurfaceActorGeneration;
  readonly actorKey: GpuFlowVisibleFrameActorKey;
  readonly contentFrameId: GpuFlowContentFrameId;
  readonly projectionSampleId: GpuFlowProjectionSampleId;
}): GpuFlowVisibleFrameActorProof {
  if (actorKey.family === "active-editor") {
    return createGpuFlowVisibleFrameBlockedActorProof({
      actorKey,
      reason: "active-editor-live-proof-required",
    });
  }
  return createGpuFlowVisibleFrameCompatiblePreviousProof({
    actor,
    actorKey,
    contentFrameId,
    projectionSampleId,
  });
}

function createGpuFlowVisibleFrameCompatiblePreviousProof({
  actor,
  actorKey,
  contentFrameId,
  projectionSampleId,
}: {
  readonly actor: GpuFlowCommittedSurfaceActorGeneration;
  readonly actorKey: GpuFlowVisibleFrameActorKey;
  readonly contentFrameId: GpuFlowContentFrameId;
  readonly projectionSampleId: GpuFlowProjectionSampleId;
}): GpuFlowVisibleFrameActorProof {
  const compatiblePreviousProof =
    actor.textCoverageProof?.projectionCoverage === "compatible-previous"
      ? actor.textCoverageProof.compatiblePreviousProof
      : null;
  if (compatiblePreviousProof === null) {
    throw new Error(
      "GPU Flow compatible-previous manifest proof requires compatible-previous text coverage.",
    );
  }
  return Object.freeze({
    ...actorKey,
    compatiblePreviousProof: Object.freeze({
      family: assertGpuFlowVisibleFrameBrowserActorFamily(actorKey),
      proof: Object.freeze({
        activeEditorState: undefined,
        actorId: actor.actorId,
        browserVisualGeneration: actor.visualGenerationId,
        candidateContentFrameId: contentFrameId,
        candidateProjectionSampleId: projectionSampleId,
        clipChainGeneration: actor.clipChainRevision,
        previousContentFrameId: createGpuFlowContentFrameId(
          String(compatiblePreviousProof.previousCommittedFrameId),
        ),
        previousPresentationId: createGpuFlowPresentationId(
          compatiblePreviousProof.previousTransactionId,
        ),
        representationKind:
          getGpuFlowVisibleFrameBrowserRepresentationKind(actor),
        resourceId:
          compatiblePreviousProof.resourceHandles[0]?.id ??
          compatiblePreviousProof.protectedResourceIds[0] ??
          actor.ownerSurfaceId,
        scrollProjectionGeneration:
          compatiblePreviousProof.requestedProjectionSampleRevision,
        semanticGeneration: actor.semanticGenerationId,
        sourceRect: createGpuFlowVisibleFrameRect(actor.sourceRect),
        visibleClip: createGpuFlowVisibleFrameRect(actor.clipRect),
      }),
    }),
    proof: "compatible-previous" as const,
    requirement: "required" as const,
  });
}

function createGpuFlowVisibleFramePresentationActorProof(
  entry: GpuFlowVisibleFrameActorManifestEntry,
): GpuFlowVisibleFrameActorProof {
  return Object.freeze({
    actorId: entry.actorId,
    family: entry.family,
    generationId: [
      entry.contentGeneration,
      entry.projectionGeneration,
      entry.readinessProof,
    ].join("|"),
    proof: "exact" as const,
    requirement: "required" as const,
  });
}

function createGpuFlowVisibleFrameSyntheticBlockedProof({
  actorId,
  family,
  reason,
}: GpuFlowVisibleFrameActorKey & {
  readonly reason: string;
}): GpuFlowVisibleFrameActorProof {
  return Object.freeze({
    actorId,
    family,
    proof: "blocked" as const,
    reason,
    requirement: "required" as const,
  });
}

function createGpuFlowVisibleFrameActorProofKey(
  actor: GpuFlowCommittedSurfaceActorGeneration,
): GpuFlowVisibleFrameActorKey {
  return Object.freeze({
    actorId: actor.actorId,
    family: getGpuFlowBrowserStyleVisibleFrameActorFamily(actor),
  });
}

function assertGpuFlowVisibleFrameBrowserActorFamily(
  actorKey: GpuFlowVisibleFrameActorKey,
): GpuFlowVisibleFrameBrowserActorFamily {
  if (
    actorKey.family !== "active-editor" &&
    actorKey.family !== "browser-text-control" &&
    actorKey.family !== "browser-text-snapshot"
  ) {
    throw new Error(
      "GPU Flow browser visual compatible-previous proof requires a browser-owned actor family.",
    );
  }
  return actorKey.family;
}

function getGpuFlowVisibleFrameBrowserRepresentationKind(
  actor: GpuFlowCommittedSurfaceActorGeneration,
): GpuFlowVisibleFrameBrowserRepresentationKind {
  if (isGpuFlowVisibleFrameActiveEditorRepresentation(actor)) {
    return "active-editor";
  }
  if (isGpuFlowVisibleFrameSnapshotRepresentation(actor)) {
    return "snapshot";
  }
  return "live-dom";
}

function isGpuFlowVisibleFrameActiveEditorRepresentation(
  actor: GpuFlowCommittedSurfaceActorGeneration,
): boolean {
  return actor.active || actor.browserVisual?.representationKind === "active-editor";
}

function isGpuFlowVisibleFrameSnapshotRepresentation(
  actor: GpuFlowCommittedSurfaceActorGeneration,
): boolean {
  const projectionCoverage = actor.textCoverageProof?.projectionCoverage;
  return (
    actor.browserVisual?.representationKind === "passive-snapshot" ||
    projectionCoverage === "exact-snapshot" ||
    projectionCoverage === "compatible-previous"
  );
}

export function createGpuFlowVisibleFrameActorKeyForBlockedReason({
  index,
  reason,
}: {
  readonly index: number;
  readonly reason: GpuFlowBlockedVisibleReason;
}): GpuFlowVisibleFrameActorKey {
  return Object.freeze({
    actorId:
      reason.actorId ?? `blocked:${reason.family}:${reason.reason}:${index}`,
    family: getGpuFlowBrowserStyleBlockedReasonFamily(reason),
  });
}

function setGpuFlowVisibleFrameActorManifestEntry({
  entry,
  entryByKey,
}: {
  readonly entry: GpuFlowVisibleFrameActorManifestEntry;
  readonly entryByKey: Map<string, GpuFlowVisibleFrameActorManifestEntry>;
}): void {
  entryByKey.set(createGpuFlowVisibleFrameActorKey(entry), entry);
}

function setGpuFlowVisibleFrameActorProof({
  proof,
  proofByActor,
}: {
  readonly proof: GpuFlowVisibleFrameActorProof;
  readonly proofByActor: Map<string, GpuFlowVisibleFrameActorProof>;
}): void {
  const key = createGpuFlowVisibleFrameActorKey(proof);
  const existingProof = proofByActor.get(key);
  if (existingProof?.proof === "true-hole") {
    return;
  }
  proofByActor.set(key, proof);
}

function createGpuFlowVisibleFrameViewportRect({
  frame,
  sample,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly sample: GpuFlowLiveProjectionSample | null;
}): GpuFlowVisibleFrameRect | null {
  const sampleViewport = sample?.cssViewport ?? null;
  const frameViewport = frame.retainedRuntimeFrame?.input?.viewportSize ?? null;
  return {
    height: resolveGpuFlowVisibleFrameViewportDimension(
      sampleViewport,
      frameViewport,
      "height",
    ),
    width: resolveGpuFlowVisibleFrameViewportDimension(
      sampleViewport,
      frameViewport,
      "width",
    ),
    x: 0,
    y: 0,
  };
}

function resolveGpuFlowVisibleFrameViewportDimension(
  sampleViewport: GpuFlowLiveProjectionSample["cssViewport"] | null,
  frameViewport: NonNullable<
    GpuFlowCommittedSurfaceFrame["retainedRuntimeFrame"]
  >["input"]["viewportSize"] | null,
  dimension: "height" | "width",
): number {
  return sampleViewport?.[dimension] ?? frameViewport?.[dimension] ?? 0;
}

function createGpuFlowVisibleFrameRect(
  rect:
    | {
        readonly height: number;
        readonly width: number;
        readonly x: number;
        readonly y: number;
      }
    | null
    | undefined,
): GpuFlowVisibleFrameRect {
  return Object.freeze({
    height: rect?.height ?? 0,
    width: rect?.width ?? 0,
    x: rect?.x ?? 0,
    y: rect?.y ?? 0,
  });
}
