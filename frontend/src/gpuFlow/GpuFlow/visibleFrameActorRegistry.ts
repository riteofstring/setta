import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";

const GPU_FLOW_VISIBLE_FRAME_ACTOR_FAMILIES = Object.freeze([
  "scene-background",
  "grid",
  "edges",
  "section-shell",
  "section-header",
  "section-body-clip",
  "retained-page",
  "retained-native-visual",
  "browser-text-control",
  "browser-text-snapshot",
  "active-editor",
  "dom-island",
  "viewport-portal",
  "hit-generation",
  "accessibility-exposure",
  "debug-snapshot",
  "public-runtime-state",
] as const);

export type GpuFlowBrowserStyleVisibleFrameActorFamily =
  (typeof GPU_FLOW_VISIBLE_FRAME_ACTOR_FAMILIES)[number];

type GpuFlowCommittedVisibleFrameActor =
  GpuFlowCommittedSurfaceFrame["actorGenerations"][number];

const GPU_FLOW_DIRECT_VISIBLE_FRAME_ACTOR_FAMILY = Object.freeze({
  "dom-island": "dom-island",
  "gpu-native-visual": "retained-native-visual",
  "html-texture": "retained-page",
  "retained-page": "retained-page",
  "section-body-clip": "section-body-clip",
  "section-header": "section-header",
  "section-shell": "section-shell",
} satisfies Readonly<
  Record<string, GpuFlowBrowserStyleVisibleFrameActorFamily>
>);

const GPU_FLOW_DIRECT_BLOCKED_REASON_FAMILY = Object.freeze({
  "accessibility-exposure": "accessibility-exposure",
  "active-editor": "active-editor",
  "browser-text-snapshot": "browser-text-snapshot",
  "compatible-previous": "browser-text-snapshot",
  "debug-snapshot": "debug-snapshot",
  "dom-island": "dom-island",
  edges: "edges",
  "gpu-native-visual": "retained-native-visual",
  grid: "grid",
  "hit-debug": "hit-generation",
  "hit-generation": "hit-generation",
  "native-visual": "retained-native-visual",
  "presentation-pair": "public-runtime-state",
  "public-runtime-state": "public-runtime-state",
  "resource-maintenance": "retained-page",
  "resource-protection": "retained-page",
  "retained-native-visual": "retained-native-visual",
  "retained-page": "retained-page",
  "retained-projection": "retained-page",
  "scene-background": "scene-background",
  "section-body-clip": "section-body-clip",
  "section-header": "section-header",
  "section-shell": "section-shell",
  "viewport-portal": "viewport-portal",
  "visible-transaction": "retained-page",
} satisfies Readonly<
  Record<string, GpuFlowBrowserStyleVisibleFrameActorFamily>
>);

const GPU_FLOW_BROWSER_TEXT_BLOCKED_REASON_FAMILIES = new Set([
  "browser-text-control",
  "browser-visual",
  "dom-control",
  "text-like-dom-control",
]);

export function getGpuFlowBrowserStyleVisibleFrameActorFamily(
  actor: GpuFlowCommittedVisibleFrameActor,
): GpuFlowBrowserStyleVisibleFrameActorFamily {
  if (isGpuFlowTextActorFamily(actor.actorFamily)) {
    return getGpuFlowBrowserStyleTextActorFamily(actor);
  }
  const family = GPU_FLOW_DIRECT_VISIBLE_FRAME_ACTOR_FAMILY[actor.actorFamily];
  if (family) {
    return family;
  }
  throw new Error(
    `Unsupported GPU Flow committed visible actor family "${actor.actorFamily}".`,
  );
}

export function getGpuFlowBrowserStyleBlockedReasonFamily({
  family,
  reason,
}: {
  readonly family: string;
  readonly reason?: string | null | undefined;
}): GpuFlowBrowserStyleVisibleFrameActorFamily {
  if (GPU_FLOW_BROWSER_TEXT_BLOCKED_REASON_FAMILIES.has(family)) {
    return reason === "snapshot-pending"
      ? "browser-text-snapshot"
      : "browser-text-control";
  }
  const browserStyleFamily = GPU_FLOW_DIRECT_BLOCKED_REASON_FAMILY[family];
  if (browserStyleFamily) {
    return browserStyleFamily;
  }
  throw new Error(
    `Unsupported GPU Flow browser-style visible actor family "${family}".`,
  );
}

function getGpuFlowBrowserStyleTextActorFamily(
  actor: GpuFlowCommittedVisibleFrameActor,
): GpuFlowBrowserStyleVisibleFrameActorFamily {
  if (isGpuFlowActiveTextActor(actor)) {
    return "active-editor";
  }
  if (isGpuFlowSnapshotTextActor(actor)) {
    return "browser-text-snapshot";
  }
  return "browser-text-control";
}

function isGpuFlowTextActorFamily(actorFamily: string): boolean {
  return (
    actorFamily === "dom-control" || actorFamily === "text-like-dom-control"
  );
}

function isGpuFlowActiveTextActor(
  actor: GpuFlowCommittedVisibleFrameActor,
): boolean {
  return (
    actor.active || actor.browserVisual?.representationKind === "active-editor"
  );
}

function isGpuFlowSnapshotTextActor(
  actor: GpuFlowCommittedVisibleFrameActor,
): boolean {
  const projectionCoverage = actor.textCoverageProof?.projectionCoverage;
  return (
    actor.browserVisual?.representationKind === "passive-snapshot" ||
    projectionCoverage === "exact-snapshot" ||
    projectionCoverage === "compatible-previous" ||
    projectionCoverage === "blocked-awaiting-browser-visual"
  );
}
