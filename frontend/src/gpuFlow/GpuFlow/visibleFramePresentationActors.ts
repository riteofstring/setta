import type { GpuFlowPreparedContentFrame } from "../preparedContentFrame";
import type { GpuFlowLiveProjectionSample } from "../projectionRuntime";
import type { GpuFlowVisibleFrameActorManifestEntry } from "./visibleFrameActorManifest";
import type { GpuFlowBrowserStyleVisibleFrameActorFamily } from "./visibleFrameActorRegistry";
import type { GpuFlowVisibleFrameRect } from "./visibleFrameTypes";

type GpuFlowVisibleFramePresentationGeneration = {
  readonly contentGeneration: string;
  readonly projectionGeneration: string;
  readonly readinessProof: string;
};

type GpuFlowVisibleFramePresentationGenerationFactory = (input: {
  readonly frame: GpuFlowPreparedContentFrame;
  readonly sample: GpuFlowLiveProjectionSample | null;
}) => GpuFlowVisibleFramePresentationGeneration;

export const GPU_FLOW_PRESENTATION_ACTOR_FAMILIES = Object.freeze([
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

export function createGpuFlowVisibleFramePresentationManifestEntries({
  frame,
  sample,
}: {
  readonly frame: GpuFlowPreparedContentFrame;
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
  readonly frame: GpuFlowPreparedContentFrame;
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
  readonly frame: GpuFlowPreparedContentFrame;
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
  readonly frame: GpuFlowPreparedContentFrame;
  readonly sample: GpuFlowLiveProjectionSample | null;
}): GpuFlowVisibleFramePresentationGeneration {
  const domGeneration = frame.presentationProof?.domGeneration;
  return {
    contentGeneration: getGpuFlowAccessibilityExposureContentGeneration({
      domGeneration,
      frame,
    }),
    projectionGeneration: `accessibility:${sample?.id ?? frame.displayFrameId}`,
    readinessProof:
      getGpuFlowAccessibilityExposureReadinessProof(domGeneration),
  };
}

function getGpuFlowAccessibilityExposureContentGeneration({
  domGeneration,
  frame,
}: {
  readonly domGeneration:
    | NonNullable<
        GpuFlowPreparedContentFrame["presentationProof"]
      >["domGeneration"]
    | undefined;
  readonly frame: GpuFlowPreparedContentFrame;
}): string {
  return (
    domGeneration?.presentationBatchId ??
    `accessibility:${frame.displayFrameId}`
  );
}

function getGpuFlowAccessibilityExposureReadinessProof(
  domGeneration:
    | NonNullable<
        GpuFlowPreparedContentFrame["presentationProof"]
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
  readonly frame: GpuFlowPreparedContentFrame;
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
  readonly frame: GpuFlowPreparedContentFrame;
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
  readonly frame: GpuFlowPreparedContentFrame;
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
  readonly frame: GpuFlowPreparedContentFrame;
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
  readonly frame: GpuFlowPreparedContentFrame;
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
  readonly frame: GpuFlowPreparedContentFrame;
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
  readonly frame: GpuFlowPreparedContentFrame;
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

function createGpuFlowVisibleFrameViewportRect({
  frame,
  sample,
}: {
  readonly frame: GpuFlowPreparedContentFrame;
  readonly sample: GpuFlowLiveProjectionSample | null;
}): GpuFlowVisibleFrameRect {
  const sampleViewport = sample?.cssViewport ?? null;
  const frameViewport = frame.retainedRuntimeFrame?.input?.viewportSize ?? null;
  return Object.freeze({
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
  });
}

function resolveGpuFlowVisibleFrameViewportDimension(
  sampleViewport: GpuFlowLiveProjectionSample["cssViewport"] | null,
  frameViewport:
    | NonNullable<
        GpuFlowPreparedContentFrame["retainedRuntimeFrame"]
      >["input"]["viewportSize"]
    | null,
  dimension: "height" | "width",
): number {
  return sampleViewport?.[dimension] ?? frameViewport?.[dimension] ?? 0;
}
