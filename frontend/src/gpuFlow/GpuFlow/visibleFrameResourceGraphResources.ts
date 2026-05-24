import { isGpuFlowPreparedContentCompletenessBlockingActor } from "../preparedContentCompleteness";
import type {
  GpuFlowPreparedContentActorGeneration,
  GpuFlowPreparedContentFrame,
} from "../preparedContentFrame";
import type { SurfaceResourceHandle } from "../surfaceCompositor/surfaceCoverage";
import type { GpuFlowBrowserVisualActorCandidate } from "./browserVisualActorRuntime";
import { getGpuFlowBrowserStyleVisibleFrameActorFamily } from "./visibleFrameActorRegistry";
import { GPU_FLOW_PRESENTATION_ACTOR_FAMILIES } from "./visibleFrameActorManifest";
import {
  createGpuFlowDomControlLiveHostPreparationResourceKey,
  createGpuFlowDomControlSnapshotPreparationResourceKey,
} from "./visibleFrameBrowserVisualResourceKeys";
import type { GpuFlowBlockedVisibleReason } from "./visibleFramePresentationProofs";
import type {
  GpuFlowVisibleFrameResourcePreparationLane,
  GpuFlowVisibleFrameResourcePriority,
} from "./visibleFrameResourceGraph";

type GpuFlowVisibleFramePresentationResourceProtectionReport = {
  readonly missingResourceKeys: readonly string[];
  readonly protected: boolean;
  readonly protectedResourceKeys: readonly string[];
  readonly requiredResourceKeys: readonly string[];
};

type GpuFlowVisibleFramePresentationResourceProtectionDigest = string;

const GPU_FLOW_ACTOR_RESOURCE_PREPARATION_LANE_BY_FAMILY = Object.freeze({
  "accessibility-exposure": "presentation-state",
  "active-editor": "browser-visual",
  "browser-text-control": "browser-visual",
  "browser-text-snapshot": "browser-visual",
  "debug-snapshot": "debug-hit",
  "dom-island": "dom-island",
  edges: "presentation-state",
  grid: "presentation-state",
  "hit-generation": "debug-hit",
  "public-runtime-state": "presentation-state",
  "retained-native-visual": "retained-page",
  "retained-page": "retained-page",
  "scene-background": "presentation-state",
  "section-body-clip": "section-structure",
  "section-header": "section-structure",
  "section-shell": "section-structure",
  "viewport-portal": "presentation-state",
} satisfies Record<string, GpuFlowVisibleFrameResourcePreparationLane>);

export type GpuFlowVisibleFrameCandidateResourceEntry = {
  readonly activeEditorPins: readonly string[];
  readonly actorResourceKeys: readonly string[];
  readonly browserVisualCandidate: GpuFlowBrowserVisualActorCandidate;
  readonly candidateResourceKeys: readonly string[];
  readonly frame: GpuFlowPreparedContentFrame;
  readonly requiredResourceKeys: readonly string[];
};

export type GpuFlowVisibleFrameCandidateResourceRequest = {
  readonly deadlineFrame: number | null;
  readonly estimatedCostMs: number;
  readonly ownerFrameId: number;
  readonly preparationLane: GpuFlowVisibleFrameResourcePreparationLane;
  readonly priority: GpuFlowVisibleFrameResourcePriority;
  readonly readinessState: "ready" | "requested";
  readonly resourceKey: string;
};

export function createGpuFlowVisibleFramePresentationResourceProtectionReport(
  preparedContentFrame: GpuFlowPreparedContentFrame | null,
): GpuFlowVisibleFramePresentationResourceProtectionReport {
  if (preparedContentFrame === null) {
    return createGpuFlowVisibleFramePresentationResourceProtectionReportFromKeys(
      {
        protectedResourceKeys: [],
        requiredResourceKeys: [],
      },
    );
  }
  return createGpuFlowVisibleFramePresentationResourceProtectionReportFromKeys({
    protectedResourceKeys:
      createGpuFlowVisibleFramePresentationProtectedResourceKeys(
        preparedContentFrame,
      ),
    requiredResourceKeys:
      createGpuFlowVisibleFramePresentationRequiredResourceKeys(
        preparedContentFrame,
      ),
  });
}

export function createGpuFlowVisibleFramePresentationResourceBlockedReasons(
  preparedContentFrame: GpuFlowPreparedContentFrame,
): readonly GpuFlowBlockedVisibleReason[] {
  return Object.freeze(
    createGpuFlowVisibleFramePresentationResourceProtectionReport(
      preparedContentFrame,
    ).missingResourceKeys.map((resourceKey) =>
      Object.freeze({
        actorId: null,
        family: "resource-protection",
        reason: `missing-protected-resource:${resourceKey}`,
      }),
    ),
  );
}

export function createGpuFlowVisibleFramePresentationResourceProtectionDigest(
  report: GpuFlowVisibleFramePresentationResourceProtectionReport,
): GpuFlowVisibleFramePresentationResourceProtectionDigest {
  return JSON.stringify({
    missingResourceKeys: [...report.missingResourceKeys].sort(),
    protected: report.protected,
    protectedResourceKeys: [...report.protectedResourceKeys].sort(),
    requiredResourceKeys: [...report.requiredResourceKeys].sort(),
  });
}

export function assertGpuFlowVisibleFramePresentationResourcesProtected(
  report: GpuFlowVisibleFramePresentationResourceProtectionReport,
): void {
  if (report.protected) {
    return;
  }
  throw new Error(
    `GPU Flow visible frame presentation proof requires protected resources for all actor proofs: ${report.missingResourceKeys.join(
      ", ",
    )}.`,
  );
}

export function createGpuFlowVisibleFrameCandidateResourceRequests({
  entry,
  frameId,
  transitionFrame,
}: {
  readonly entry: GpuFlowVisibleFrameCandidateResourceEntry;
  readonly frameId: number;
  readonly transitionFrame: number;
}): readonly GpuFlowVisibleFrameCandidateResourceRequest[] {
  const requestByKey = new Map<
    string,
    GpuFlowVisibleFrameCandidateResourceRequest
  >();
  for (const resourceKey of entry.requiredResourceKeys) {
    setGpuFlowVisibleFrameCandidateResourceRequest({
      request: createGpuFlowVisibleFrameCandidateResourceRequest({
        frameId,
        preparationLane:
          inferGpuFlowVisibleFrameResourcePreparationLane(resourceKey),
        priority: "safety",
        readinessState: "ready",
        resourceKey,
        transitionFrame,
      }),
      requestByKey,
    });
  }
  for (const control of entry.browserVisualCandidate.snapshot.domControls
    .mountedControls) {
    const resourceKey =
      createGpuFlowDomControlLiveHostPreparationResourceKey(control);
    setGpuFlowVisibleFrameCandidateResourceRequest({
      request: createGpuFlowVisibleFrameCandidateResourceRequest({
        frameId,
        preparationLane: "browser-visual",
        priority: "safety",
        readinessState: getGpuFlowBrowserVisualResourceReadinessState({
          actorId: control.sourceId,
          readinessByActorId:
            entry.browserVisualCandidate.readiness.domControlReadinessByActorId,
          resourceKey,
        }),
        resourceKey,
        transitionFrame,
      }),
      requestByKey,
    });
  }
  for (const control of entry.browserVisualCandidate.snapshot.domControls
    .snapshotControls) {
    const resourceKey =
      createGpuFlowDomControlSnapshotPreparationResourceKey(control);
    setGpuFlowVisibleFrameCandidateResourceRequest({
      request: createGpuFlowVisibleFrameCandidateResourceRequest({
        frameId,
        preparationLane: "browser-visual",
        priority: "safety",
        readinessState: getGpuFlowBrowserVisualResourceReadinessState({
          actorId: control.sourceId,
          readinessByActorId:
            entry.browserVisualCandidate.readiness.domControlReadinessByActorId,
          resourceKey,
        }),
        resourceKey,
        transitionFrame,
      }),
      requestByKey,
    });
  }
  for (const island of entry.browserVisualCandidate.snapshot.domIslands
    .islands) {
    const resourceKey = `dom-island:${island.id}`;
    setGpuFlowVisibleFrameCandidateResourceRequest({
      request: createGpuFlowVisibleFrameCandidateResourceRequest({
        frameId,
        preparationLane: "dom-island",
        priority: "safety",
        readinessState: getGpuFlowBrowserVisualResourceReadinessState({
          actorId: island.id,
          readinessByActorId:
            entry.browserVisualCandidate.readiness.domIslandReadinessByActorId,
          resourceKey,
        }),
        resourceKey,
        transitionFrame,
      }),
      requestByKey,
    });
  }
  for (const resourceKey of entry.candidateResourceKeys) {
    if (requestByKey.has(resourceKey)) {
      continue;
    }
    setGpuFlowVisibleFrameCandidateResourceRequest({
      request: createGpuFlowVisibleFrameCandidateResourceRequest({
        frameId,
        preparationLane:
          inferGpuFlowVisibleFrameResourcePreparationLane(resourceKey),
        priority: inferGpuFlowVisibleFrameResourcePriority(resourceKey),
        readinessState: "ready",
        resourceKey,
        transitionFrame,
      }),
      requestByKey,
    });
  }
  return Object.freeze(
    entry.candidateResourceKeys.map((resourceKey) => {
      const request = requestByKey.get(resourceKey);
      if (!request) {
        throw new Error(
          `GPU Flow visible frame resource graph missing resource request metadata for ${resourceKey}.`,
        );
      }
      return request;
    }),
  );
}

export function estimateGpuFlowVisibleFrameResourceCostMs(
  resourceKey: string,
): number {
  if (resourceKey.startsWith("dom-control-snapshot:")) {
    return 1.5;
  }
  if (resourceKey.startsWith("dom-control:")) {
    return 0.5;
  }
  if (resourceKey.startsWith("dom-island:")) {
    return 1;
  }
  if (resourceKey.startsWith("page:")) {
    return 2;
  }
  if (resourceKey.startsWith("texture:")) {
    return 1.5;
  }
  if (resourceKey.startsWith("source:")) {
    return 0.75;
  }
  if (resourceKey.startsWith("actor:")) {
    return 0.25;
  }
  return 1;
}

export function inferGpuFlowVisibleFrameResourcePreparationLane(
  resourceKey: string,
): GpuFlowVisibleFrameResourcePreparationLane {
  if (
    resourceKey.startsWith("dom-control:") ||
    resourceKey.startsWith("dom-control-snapshot:")
  ) {
    return "browser-visual";
  }
  if (resourceKey.startsWith("dom-island:")) {
    return "dom-island";
  }
  if (resourceKey.startsWith("actor:")) {
    return inferGpuFlowVisibleFrameActorResourcePreparationLane(resourceKey);
  }
  if (resourceKey.startsWith("page:") || resourceKey.startsWith("source:")) {
    return "retained-page";
  }
  if (resourceKey.startsWith("texture:")) {
    return "texture-upload";
  }
  return "maintenance-refinement";
}

export function inferGpuFlowVisibleFrameResourcePriority(
  resourceKey: string,
): GpuFlowVisibleFrameResourcePriority {
  if (
    resourceKey.startsWith("dom-control:") ||
    resourceKey.startsWith("dom-control-snapshot:") ||
    resourceKey.startsWith("dom-island:") ||
    resourceKey.startsWith("actor:") ||
    resourceKey.startsWith("page:") ||
    resourceKey.startsWith("source:") ||
    resourceKey.startsWith("texture:")
  ) {
    return "safety";
  }
  return "quality";
}

export function createGpuFlowVisibleFrameCandidateResourceEntry({
  browserVisualCandidate,
  frame,
}: {
  readonly browserVisualCandidate: GpuFlowBrowserVisualActorCandidate;
  readonly frame: GpuFlowPreparedContentFrame;
}): GpuFlowVisibleFrameCandidateResourceEntry {
  const requiredResourceKeys =
    createGpuFlowVisibleFramePresentationRequiredResourceKeys(frame);
  const actorResourceKeys =
    createGpuFlowVisibleFrameCandidateActorResourceKeys(frame);
  return Object.freeze({
    activeEditorPins: Object.freeze(
      createGpuFlowVisibleFrameCandidateActiveEditorPins(
        browserVisualCandidate,
      ),
    ),
    actorResourceKeys: Object.freeze(actorResourceKeys),
    browserVisualCandidate,
    candidateResourceKeys: Object.freeze(
      uniqueStrings([
        ...requiredResourceKeys,
        ...actorResourceKeys,
        ...createGpuFlowBrowserVisualCandidateResourceKeys(
          browserVisualCandidate,
        ),
      ]),
    ),
    frame,
    requiredResourceKeys: Object.freeze(uniqueStrings(requiredResourceKeys)),
  });
}

function createGpuFlowVisibleFramePresentationResourceProtectionReportFromKeys({
  protectedResourceKeys,
  requiredResourceKeys,
}: {
  readonly protectedResourceKeys: readonly string[];
  readonly requiredResourceKeys: readonly string[];
}): GpuFlowVisibleFramePresentationResourceProtectionReport {
  const protectedResourceKeySet = new Set(protectedResourceKeys);
  const missingResourceKeys = [
    ...new Set(
      requiredResourceKeys.filter(
        (resourceKey) => !protectedResourceKeySet.has(resourceKey),
      ),
    ),
  ];
  return Object.freeze({
    missingResourceKeys: Object.freeze(missingResourceKeys),
    protected: missingResourceKeys.length === 0,
    protectedResourceKeys: Object.freeze([...new Set(protectedResourceKeys)]),
    requiredResourceKeys: Object.freeze([...new Set(requiredResourceKeys)]),
  });
}

function createGpuFlowVisibleFramePresentationRequiredResourceKeys(
  preparedContentFrame: GpuFlowPreparedContentFrame,
): readonly string[] {
  return createGpuFlowVisibleFramePresentationResourceKeys(
    getGpuFlowVisibleFramePresentationRequiredResourceHandles(
      preparedContentFrame,
    ),
  );
}

function createGpuFlowVisibleFramePresentationProtectedResourceKeys(
  preparedContentFrame: GpuFlowPreparedContentFrame,
): readonly string[] {
  return createGpuFlowVisibleFramePresentationResourceKeys([
    ...(preparedContentFrame.surfaceTransaction?.protectedResourceHandles ??
      []),
    ...(preparedContentFrame.surfaceTransaction?.coverageProof
      .protectedResourceHandles ?? []),
  ]);
}

function getGpuFlowVisibleFramePresentationRequiredResourceHandles(
  preparedContentFrame: GpuFlowPreparedContentFrame,
): readonly SurfaceResourceHandle[] {
  return [
    ...preparedContentFrame.actorGenerations.flatMap((actor) =>
      getGpuFlowVisibleFramePresentationActorRequiredResourceHandles({
        actor,
        startup: preparedContentFrame.retainedDisplayFrame === null,
      }),
    ),
    ...(preparedContentFrame.surfaceTransaction?.coverageProof.exactCoverage.flatMap(
      (entry) => entry.resourceHandles,
    ) ?? []),
    ...(preparedContentFrame.surfaceTransaction?.coverageProof.compatibleCoverage.flatMap(
      (entry) => entry.resourceHandles,
    ) ?? []),
  ];
}

function getGpuFlowVisibleFramePresentationActorRequiredResourceHandles({
  actor,
  startup,
}: {
  readonly actor: GpuFlowPreparedContentActorGeneration;
  readonly startup: boolean;
}): readonly SurfaceResourceHandle[] {
  if (
    !isGpuFlowPreparedContentCompletenessBlockingActor({
      actor,
      startup,
    })
  ) {
    return [];
  }
  if (actor.kind === "dom-control") {
    return [];
  }
  return [
    ...(actor.browserVisual?.resourceHandles ?? []),
    ...(actor.textCoverageProof?.projectionCoverage === "compatible-previous"
      ? actor.textCoverageProof.compatiblePreviousProof.resourceHandles
      : []),
  ];
}

function createGpuFlowVisibleFramePresentationResourceKeys(
  resourceHandles: readonly SurfaceResourceHandle[],
): readonly string[] {
  return resourceHandles.map(createGpuFlowVisibleFramePresentationResourceKey);
}

function createGpuFlowVisibleFramePresentationResourceKey(
  handle: SurfaceResourceHandle,
): string {
  return `${handle.kind}:${handle.id}`;
}

function createGpuFlowVisibleFrameCandidateResourceRequest({
  frameId,
  preparationLane,
  priority,
  readinessState,
  resourceKey,
  transitionFrame,
}: {
  readonly frameId: number;
  readonly preparationLane: GpuFlowVisibleFrameResourcePreparationLane;
  readonly priority: GpuFlowVisibleFrameResourcePriority;
  readonly readinessState: "ready" | "requested";
  readonly resourceKey: string;
  readonly transitionFrame: number;
}): GpuFlowVisibleFrameCandidateResourceRequest {
  return Object.freeze({
    deadlineFrame: createGpuFlowVisibleFrameResourceDeadlineFrame({
      priority,
      transitionFrame,
    }),
    estimatedCostMs: estimateGpuFlowVisibleFrameResourceCostMs(resourceKey),
    ownerFrameId: frameId,
    preparationLane,
    priority,
    readinessState,
    resourceKey,
  });
}

function setGpuFlowVisibleFrameCandidateResourceRequest({
  request,
  requestByKey,
}: {
  readonly request: GpuFlowVisibleFrameCandidateResourceRequest;
  readonly requestByKey: Map<
    string,
    GpuFlowVisibleFrameCandidateResourceRequest
  >;
}): void {
  if (requestByKey.has(request.resourceKey)) {
    throw new Error(
      `GPU Flow visible frame resource graph received duplicate resource request metadata for ${request.resourceKey}.`,
    );
  }
  requestByKey.set(request.resourceKey, request);
}

function getGpuFlowBrowserVisualResourceReadinessState({
  actorId,
  readinessByActorId,
  resourceKey,
}: {
  readonly actorId: string;
  readonly readinessByActorId: ReadonlyMap<
    string,
    { readonly coverageState: string }
  >;
  readonly resourceKey: string;
}): GpuFlowVisibleFrameCandidateResourceRequest["readinessState"] {
  const readiness = readinessByActorId.get(actorId);
  if (!readiness) {
    throw new Error(
      `GPU Flow visible frame resource graph missing browser visual readiness for ${resourceKey}.`,
    );
  }
  return GPU_FLOW_BLOCKED_BROWSER_VISUAL_RESOURCE_COVERAGE_STATES.has(
    readiness.coverageState,
  )
    ? "requested"
    : "ready";
}

const GPU_FLOW_BLOCKED_BROWSER_VISUAL_RESOURCE_COVERAGE_STATES = new Set([
  "blocked-awaiting-browser-visual",
  "blocked-awaiting-live-host",
  "blocked-awaiting-snapshot",
]);

export function createGpuFlowVisibleFrameResourceDeadlineFrame({
  priority,
  transitionFrame,
}: {
  readonly priority: GpuFlowVisibleFrameResourcePriority;
  readonly transitionFrame: number;
}): number {
  switch (priority) {
    case "safety":
      return transitionFrame + 1;
    case "continuity":
      return transitionFrame + 2;
    case "quality":
      return transitionFrame + 6;
  }
}

function createGpuFlowBrowserVisualCandidateResourceKeys(
  candidate: GpuFlowBrowserVisualActorCandidate,
): readonly string[] {
  return uniqueStrings([
    ...candidate.snapshot.domControls.mountedControls.map(
      createGpuFlowDomControlLiveHostPreparationResourceKey,
    ),
    ...candidate.snapshot.domControls.snapshotControls.map(
      createGpuFlowDomControlSnapshotPreparationResourceKey,
    ),
    ...candidate.snapshot.domIslands.islands.map(
      (island) => `dom-island:${island.id}`,
    ),
  ]);
}

function createGpuFlowVisibleFrameCandidateActorResourceKeys(
  frame: GpuFlowPreparedContentFrame,
): readonly string[] {
  return uniqueStrings([
    ...GPU_FLOW_PRESENTATION_ACTOR_FAMILIES.map((family) =>
      createGpuFlowVisibleFrameActorResourceKey({
        actorId: family,
        family,
      }),
    ),
    ...frame.actorGenerations.flatMap((actor) => {
      if (!actor.actorFamily || actor.visibleNonempty === false) {
        return [];
      }
      return [
        createGpuFlowVisibleFrameActorResourceKey({
          actorId: actor.actorId,
          family: getGpuFlowBrowserStyleVisibleFrameActorFamily(actor),
        }),
      ];
    }),
  ]);
}

function createGpuFlowVisibleFrameActorResourceKey({
  actorId,
  family,
}: {
  readonly actorId: string;
  readonly family: string;
}): string {
  return `actor:${family}:${actorId}`;
}

function inferGpuFlowVisibleFrameActorResourcePreparationLane(
  resourceKey: string,
): GpuFlowVisibleFrameResourcePreparationLane {
  const family = parseGpuFlowVisibleFrameActorResourceFamily(resourceKey);
  const lane = GPU_FLOW_ACTOR_RESOURCE_PREPARATION_LANE_BY_FAMILY[family];
  if (!lane) {
    throw new Error(
      `GPU Flow visible frame actor resource has unsupported family "${family}".`,
    );
  }
  return lane;
}

function parseGpuFlowVisibleFrameActorResourceFamily(
  resourceKey: string,
): (typeof GPU_FLOW_PRESENTATION_ACTOR_FAMILIES)[number] | string {
  const [, family] = resourceKey.split(":", 3);
  if (!family) {
    throw new Error(
      `GPU Flow visible frame actor resource key is missing a family: ${resourceKey}.`,
    );
  }
  return family;
}

function createGpuFlowVisibleFrameCandidateActiveEditorPins(
  candidate: GpuFlowBrowserVisualActorCandidate,
): readonly string[] {
  return uniqueStrings(
    candidate.snapshot.domControls.controls
      .filter(
        (control) =>
          control.active ||
          control.visualSemantics.accessibility === "active-browser-editor" ||
          control.textCoverageState.caret === "visible" ||
          control.textCoverageState.composition === "active" ||
          control.textCoverageState.selection !== "none",
      )
      .map((control) => control.sourceId),
  );
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}
