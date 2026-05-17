import type { GpuFlowCommittedSurfaceActorGeneration } from "./committedSurfaceFrame";
import {
  createBrowserVisualSurfaceTransactionFragment,
  type BrowserVisualActor,
  type BrowserVisualSurfaceTransactionFragment,
} from "./surfaceCompositor/browserVisualActorAdapter";
import { createSurfaceCoverageProof } from "./surfaceCompositor/surfaceCoverage";
import {
  createSurfaceDisplayTransaction,
  type SurfaceDisplayTransaction,
  type SurfaceDrawCommand,
} from "./surfaceCompositor/surfaceTransaction";

export function createGpuFlowCommittedSurfaceBrowserVisualFragment(
  browserVisualActors: readonly BrowserVisualActor[],
): BrowserVisualSurfaceTransactionFragment {
  return createBrowserVisualSurfaceTransactionFragment(browserVisualActors);
}

export function createGpuFlowCommittedSurfaceTransaction({
  browserVisualSurfaceFragment,
  displayFrameId,
  retainedSurfaceTransaction,
}: {
  readonly browserVisualSurfaceFragment: BrowserVisualSurfaceTransactionFragment;
  readonly displayFrameId: number;
  readonly retainedSurfaceTransaction: SurfaceDisplayTransaction;
}): SurfaceDisplayTransaction | null {
  if (browserVisualSurfaceFragment.blockingSurfaceIds.length > 0) {
    return null;
  }
  const browserVisualDrawCommands = createBrowserVisualDrawCommands(
    browserVisualSurfaceFragment,
  );
  const activeIslands = [
    ...retainedSurfaceTransaction.activeDomIslandTransaction.islands,
    ...browserVisualSurfaceFragment.activeIslands,
  ];
  return createSurfaceDisplayTransaction({
    ...retainedSurfaceTransaction,
    activeDomIslandTransaction: {
      islands: activeIslands,
      mode:
        activeIslands.length > 0
          ? "attach"
          : retainedSurfaceTransaction.activeDomIslandTransaction.mode,
    },
    coverageProof: createSurfaceCoverageProof({
      ...retainedSurfaceTransaction.coverageProof,
      compatibleCoverage: [
        ...retainedSurfaceTransaction.coverageProof.compatibleCoverage,
        ...browserVisualSurfaceFragment.compatibleCoverage,
      ],
      exactCoverage: [
        ...retainedSurfaceTransaction.coverageProof.exactCoverage,
        ...browserVisualSurfaceFragment.exactCoverage,
      ],
      protectedResourceHandles: uniqueProtectedResourceHandles([
        ...retainedSurfaceTransaction.coverageProof.protectedResourceHandles,
        ...browserVisualSurfaceFragment.protectedResourceHandles,
      ]),
      rendererBuckets: uniqueOrdered([
        ...retainedSurfaceTransaction.coverageProof.rendererBuckets,
        ...browserVisualSurfaceFragment.rendererBuckets,
      ]),
      trueHoleRects: [
        ...retainedSurfaceTransaction.coverageProof.trueHoleRects,
        ...browserVisualSurfaceFragment.trueHoleRects,
      ],
      visibleRects: [
        ...retainedSurfaceTransaction.coverageProof.visibleRects,
        ...browserVisualSurfaceFragment.visibleRects,
      ],
      zOrder: uniqueOrdered([
        ...retainedSurfaceTransaction.coverageProof.zOrder,
        ...browserVisualSurfaceFragment.zOrder,
      ]),
    }),
    desiredSurfaceGenerations: [
      ...retainedSurfaceTransaction.desiredSurfaceGenerations,
      ...browserVisualSurfaceFragment.actorSnapshots.map(
        (snapshot) => snapshot.generation,
      ),
    ],
    diagnostics: {
      ...retainedSurfaceTransaction.diagnostics,
      hold: null,
    },
    drawCommands: [
      ...retainedSurfaceTransaction.drawCommands,
      ...browserVisualDrawCommands,
    ],
    hitIndex: {
      generationIds: [
        ...retainedSurfaceTransaction.hitIndex.generationIds,
        ...browserVisualSurfaceFragment.actorSnapshots.map(
          (snapshot) => snapshot.generation.generationId,
        ),
      ],
      id: `committed-hit:${displayFrameId}`,
    },
    id: `committed-surface:${displayFrameId}:${retainedSurfaceTransaction.id}`,
    motionFrame: {
      ...retainedSurfaceTransaction.motionFrame,
      activeIslands,
    },
    protectedResourceHandles: uniqueProtectedResourceHandles([
      ...retainedSurfaceTransaction.protectedResourceHandles,
      ...browserVisualSurfaceFragment.protectedResourceHandles,
    ]),
    rendererBuckets: uniqueOrdered([
      ...retainedSurfaceTransaction.rendererBuckets,
      ...browserVisualSurfaceFragment.rendererBuckets,
    ]),
    zOrder: uniqueOrdered([
      ...retainedSurfaceTransaction.zOrder,
      ...browserVisualSurfaceFragment.zOrder,
    ]),
  });
}

export function assertGpuFlowBrowserVisualSurfaceFragment({
  actorGenerations,
  browserVisualSurfaceFragment,
}: {
  readonly actorGenerations: readonly GpuFlowCommittedSurfaceActorGeneration[];
  readonly browserVisualSurfaceFragment: BrowserVisualSurfaceTransactionFragment;
}): void {
  const browserVisualContracts = actorGenerations
    .map((actor) => actor.browserVisual)
    .filter((browserVisual) => browserVisual !== null);
  const requiredBrowserVisualContracts = browserVisualContracts.filter(
    (browserVisual) => browserVisual.coverageRequired.required,
  );
  const exactCoverageCount = requiredBrowserVisualContracts.filter(
    (browserVisual) =>
      browserVisual.coverageState === "live-host-ready" ||
      browserVisual.coverageState === "exact-snapshot-ready",
  ).length;
  const compatibleCoverageCount = requiredBrowserVisualContracts.filter(
    (browserVisual) =>
      browserVisual.coverageState === "compatible-previous-ready",
  ).length;
  const blockingCoverageCount = requiredBrowserVisualContracts.filter(
    (browserVisual) =>
      browserVisual.coverageState === "blocked-awaiting-live-host" ||
      browserVisual.coverageState === "blocked-awaiting-snapshot" ||
      browserVisual.coverageState === "true-hole",
  ).length;
  if (
    browserVisualSurfaceFragment.actorSnapshots.length !==
      browserVisualContracts.length ||
    browserVisualSurfaceFragment.visibleRects.length !==
      requiredBrowserVisualContracts.length ||
    browserVisualSurfaceFragment.exactCoverage.length !== exactCoverageCount ||
    browserVisualSurfaceFragment.compatibleCoverage.length !==
      compatibleCoverageCount ||
    browserVisualSurfaceFragment.blockingSurfaceIds.length !==
      blockingCoverageCount ||
    browserVisualSurfaceFragment.blockingGenerationIds.length !==
      blockingCoverageCount
  ) {
    throw new Error(
      "GPU Flow committed surface frame has stale browser visual surface coverage.",
    );
  }
}

function createBrowserVisualDrawCommands(
  fragment: BrowserVisualSurfaceTransactionFragment,
): readonly SurfaceDrawCommand[] {
  const coverageBySurfaceId = new Map(
    [...fragment.exactCoverage, ...fragment.compatibleCoverage].map((entry) => [
      entry.surfaceId,
      entry,
    ]),
  );
  return fragment.zOrder.flatMap((surfaceId) => {
    const entry = coverageBySurfaceId.get(surfaceId);
    if (!entry) {
      return [];
    }
    return [
      {
        coverageRect: entry.coverageRect,
        generationId: entry.generationId,
        rendererBucket: entry.rendererBucket,
        surfaceId: entry.surfaceId,
        zIndex: entry.zIndex,
      },
    ];
  });
}

function uniqueOrdered<T>(values: readonly T[]): readonly T[] {
  return Object.freeze([...new Set(values)]);
}

function uniqueProtectedResourceHandles<
  T extends {
    readonly id: string;
    readonly kind: string;
    readonly reason: string;
  },
>(handles: readonly T[]): readonly T[] {
  const byKey = new Map<string, T>();
  for (const handle of handles) {
    byKey.set(`${handle.kind}:${handle.id}:${handle.reason}`, handle);
  }
  return Object.freeze([...byKey.values()]);
}
