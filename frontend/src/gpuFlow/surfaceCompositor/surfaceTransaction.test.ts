import { describe, expect, it } from "vitest";

import {
  assertSurfaceResourcesNotEvicted,
  createExactSurfaceCoverageEntry,
  createSurfaceCompatibilityProof,
  createSurfaceCoverageProof,
  type SurfaceCoverageEntry,
  type SurfaceCoverageProof,
} from "./surfaceCoverage";
import {
  createSurfaceGeneration,
  type SurfaceActiveDomIslandGeneration,
  type SurfaceGeneration,
  type SurfaceGenerationId,
  type SurfaceId,
} from "./surfaceGeneration";
import {
  createSurfaceDisplayTransaction,
  protectedSurfaceResourcesForTransaction,
  resolveSurfaceTransaction,
  selectPublishedSurfaceTransaction,
  type SurfaceDisplayTransaction,
} from "./surfaceTransaction";

describe("surface compositor transaction contracts", () => {
  it("does not publish transactions with true-hole coverage", () => {
    const desired = transaction({
      coverageProof: proof({
        blockingGenerationIds: ["surface-a:generation-2"],
        blockingSurfaceIds: ["surface-a"],
        trueHoleRects: [rect()],
      }),
      id: "desired",
    });

    expect(
      resolveSurfaceTransaction({ desired, nowMs: 10, previous: null }),
    ).toEqual({
      kind: "block-cold-first-coverage",
      reason: "coverage-missing",
    });
    expect(() => createSurfaceDisplayTransaction(desired)).toThrow(/true-hole/);
  });

  it("publishes compatible coverage while exact coverage is pending", () => {
    const compatible = coverageEntry({ fidelity: "compatible" });
    const outcome = resolveSurfaceTransaction({
      desired: transaction({
        coverageProof: proof({ compatibleCoverage: [compatible] }),
      }),
      nowMs: 10,
      previous: null,
    });

    expect(outcome.kind).toBe("publish-compatible");
    expect(
      outcome.kind === "publish-compatible"
        ? outcome.compatibilityProof.compatibleCoverage
        : [],
    ).toEqual([compatible]);
  });

  it("blocks active DOM island publication when visual coverage is incoherent", () => {
    const island = activeIsland();
    const generation = surfaceGeneration({ activeDomIsland: island });
    const previous = createSurfaceDisplayTransaction(
      transaction({ id: "previous" }),
    );
    const desired = transaction({
      activeIslands: [island],
      coverageProof: proof({
        compatibilityProof: createSurfaceCompatibilityProof({
          compatibleForActiveDomIsland: false,
          compatibleForClipChain: true,
          compatibleForHitTesting: true,
          compatibleForMotion: true,
          compatibleForSourceWindow: true,
          compatibleForVisuals: true,
          rejectedCandidates: [],
        }),
      }),
      generations: [generation],
      id: "desired",
    });

    const outcome = resolveSurfaceTransaction({
      desired,
      nowMs: 24,
      previous,
    });

    expect(outcome.kind).toBe("hold-previous");
    expect(outcome.kind === "hold-previous" ? outcome.reason : null).toBe(
      "active-dom-island-incoherent",
    );
  });

  it("holds previous visuals and hit state together", () => {
    const previous = createSurfaceDisplayTransaction(
      transaction({
        hitIndexId: "hit-previous",
        id: "previous",
        viewport: { x: 1, y: 2, zoom: 1 },
      }),
    );
    const desired = transaction({
      coverageProof: proof({
        blockingGenerationIds: ["surface-a:generation-2"],
        blockingSurfaceIds: ["surface-a"],
        trueHoleRects: [rect()],
      }),
      hitIndexId: "hit-desired",
      id: "desired",
      viewport: { x: 10, y: 20, zoom: 2 },
    });

    const outcome = resolveSurfaceTransaction({
      desired,
      nowMs: 20,
      previous,
    });
    const selected = selectPublishedSurfaceTransaction({ outcome, previous });

    expect(outcome.kind).toBe("hold-previous");
    expect(selected?.id).toBe("previous");
    expect(selected?.hitIndex.id).toBe("hit-previous");
    expect(selected?.motionFrame.viewport).toEqual({ x: 1, y: 2, zoom: 1 });
    expect(
      outcome.kind === "hold-previous"
        ? outcome.diagnostics.desiredViewport
        : null,
    ).toEqual({ x: 10, y: 20, zoom: 2 });
  });

  it("rejects multiple generation ids for one surface in a transaction", () => {
    expect(() =>
      createSurfaceDisplayTransaction(
        transaction({
          generations: [
            surfaceGeneration({
              generationId: "generation-1",
              surfaceId: "surface-a",
            }),
            surfaceGeneration({
              generationId: "generation-2",
              surfaceId: "surface-a",
            }),
          ],
        }),
      ),
    ).toThrow(/multiple generation ids/);
  });

  it("keeps publish-compatible and hold-previous as distinct outcomes", () => {
    const previous = createSurfaceDisplayTransaction(transaction());
    const compatibleOutcome = resolveSurfaceTransaction({
      desired: transaction({
        coverageProof: proof({
          compatibleCoverage: [coverageEntry({ fidelity: "compatible" })],
        }),
        id: "compatible",
      }),
      nowMs: 16,
      previous,
    });
    const heldOutcome = resolveSurfaceTransaction({
      desired: transaction({
        coverageProof: proof({ trueHoleRects: [rect()] }),
        id: "held",
      }),
      nowMs: 32,
      previous,
    });

    expect(compatibleOutcome.kind).toBe("publish-compatible");
    expect(heldOutcome.kind).toBe("hold-previous");
  });

  it("models cold first coverage without hold-previous language", () => {
    const desired = transaction({
      coverageProof: proof({ trueHoleRects: [rect()] }),
    });

    expect(
      resolveSurfaceTransaction({ desired, nowMs: 0, previous: null }),
    ).toEqual({
      kind: "block-cold-first-coverage",
      reason: "coverage-missing",
    });
    expect(
      resolveSurfaceTransaction({
        coldPlaceholderAllowed: true,
        desired,
        nowMs: 0,
        previous: null,
      }),
    ).toEqual({
      kind: "publish-cold-placeholder",
      reason: "coverage-missing",
    });
  });

  it("reports compatibility dimensions independently", () => {
    expect(
      proof({
        compatibilityProof: createSurfaceCompatibilityProof({
          compatibleForActiveDomIsland: false,
          compatibleForClipChain: true,
          compatibleForHitTesting: false,
          compatibleForMotion: true,
          compatibleForSourceWindow: true,
          compatibleForVisuals: true,
          rejectedCandidates: [
            {
              generationId: "generation-stale",
              reason: "source-window-mismatch",
              surfaceId: "surface-a",
            },
          ],
        }),
      }).compatibilityProof,
    ).toEqual({
      compatibleForActiveDomIsland: false,
      compatibleForClipChain: true,
      compatibleForHitTesting: false,
      compatibleForMotion: true,
      compatibleForSourceWindow: true,
      compatibleForVisuals: true,
      rejectedCandidates: [
        {
          generationId: "generation-stale",
          reason: "source-window-mismatch",
          surfaceId: "surface-a",
        },
      ],
    });
  });

  it("protects required transaction resources from eviction", () => {
    const protectedHandles = protectedSurfaceResourcesForTransaction({
      handles: [{ id: "texture-a", kind: "texture" }],
      reason: "published-transaction",
    });

    expect(() =>
      assertSurfaceResourcesNotEvicted({
        evictedResourceIds: ["texture-a"],
        protectedResourceHandles: protectedHandles,
      }),
    ).toThrow(/protected resources/);
    expect(() =>
      assertSurfaceResourcesNotEvicted({
        evictedResourceIds: ["texture-b"],
        protectedResourceHandles: protectedHandles,
      }),
    ).not.toThrow();
  });

  it("preserves renderer bucket order and global z-order", () => {
    expect(() =>
      createSurfaceDisplayTransaction(
        transaction({
          drawCommands: [
            drawCommand({
              rendererBucket: "retained-overlay",
              surfaceId: "surface-b",
              zIndex: 1,
            }),
            drawCommand({
              rendererBucket: "retained-content",
              surfaceId: "surface-a",
              zIndex: 0,
            }),
          ],
        }),
      ),
    ).toThrow(/renderer bucket order/);
    expect(() =>
      createSurfaceDisplayTransaction(
        transaction({
          drawCommands: [
            drawCommand({ surfaceId: "surface-b", zIndex: 1 }),
            drawCommand({ surfaceId: "surface-a", zIndex: 0 }),
          ],
          zOrder: ["surface-a", "surface-b"],
        }),
      ),
    ).toThrow(/global z-order/);
  });
});

type SurfaceTransactionTestOptions = {
  readonly activeIslands?: readonly SurfaceActiveDomIslandGeneration[];
  readonly coverageProof?: SurfaceCoverageProof;
  readonly drawCommands?: SurfaceDisplayTransaction["drawCommands"];
  readonly generations?: readonly SurfaceGeneration[];
  readonly hitIndexId?: string;
  readonly id?: string;
  readonly viewport?: {
    readonly x: number;
    readonly y: number;
    readonly zoom: number;
  };
  readonly zOrder?: readonly SurfaceId[];
};

function transaction(
  options: SurfaceTransactionTestOptions = {},
): SurfaceDisplayTransaction {
  const activeIslands = transactionActiveIslands(options.activeIslands);
  const generations = transactionGenerations(options.generations);
  return {
    activeDomIslandTransaction: {
      islands: activeIslands,
      mode: transactionActiveIslandMode(activeIslands),
    },
    coverageProof: transactionCoverageProof(options.coverageProof),
    desiredSurfaceGenerations: generations,
    diagnostics: { hold: null, publishedAtMs: 0 },
    drawCommands: transactionDrawCommands(options.drawCommands),
    followUpWorkRequests: [],
    hitIndex: {
      generationIds: generations.map((generation) => generation.generationId),
      id: transactionHitIndexId(options.hitIndexId),
    },
    id: transactionId(options.id),
    motionFrame: {
      activeIslands,
      retainedScrollOffset: null,
      viewport: transactionViewport(options.viewport),
    },
    protectedResourceHandles: [],
    rendererBuckets: ["retained-content", "retained-overlay"],
    zOrder: transactionZOrder(options.zOrder),
  };
}

function transactionActiveIslands(
  activeIslands:
    | readonly SurfaceActiveDomIslandGeneration[]
    | undefined,
): readonly SurfaceActiveDomIslandGeneration[] {
  return activeIslands ?? [];
}

function transactionActiveIslandMode(
  activeIslands: readonly SurfaceActiveDomIslandGeneration[],
): SurfaceDisplayTransaction["activeDomIslandTransaction"]["mode"] {
  return activeIslands.length > 0 ? "attach" : "none";
}

function transactionCoverageProof(
  coverageProof: SurfaceCoverageProof | undefined,
): SurfaceCoverageProof {
  return coverageProof ?? proof();
}

function transactionDrawCommands(
  drawCommands: SurfaceTransactionTestOptions["drawCommands"],
): SurfaceDisplayTransaction["drawCommands"] {
  return drawCommands ?? defaultSurfaceDrawCommands();
}

function transactionGenerations(
  generations: readonly SurfaceGeneration[] | undefined,
): readonly SurfaceGeneration[] {
  return generations ?? defaultSurfaceGenerations();
}

function transactionHitIndexId(hitIndexId: string | undefined): string {
  return hitIndexId ?? "hit-current";
}

function transactionId(id: string | undefined): string {
  return id ?? "transaction";
}

function transactionViewport(
  viewport: SurfaceTransactionTestOptions["viewport"],
): NonNullable<SurfaceTransactionTestOptions["viewport"]> {
  return viewport ?? { x: 0, y: 0, zoom: 1 };
}

function transactionZOrder(
  zOrder: readonly SurfaceId[] | undefined,
): readonly SurfaceId[] {
  return zOrder ?? ["surface-a", "surface-b"];
}

function defaultSurfaceDrawCommands(): SurfaceDisplayTransaction["drawCommands"] {
  return [
    drawCommand({ surfaceId: "surface-a", zIndex: 0 }),
    drawCommand({ surfaceId: "surface-b", zIndex: 1 }),
  ];
}

function defaultSurfaceGenerations(): readonly SurfaceGeneration[] {
  return [
    surfaceGeneration({ surfaceId: "surface-a", zIndex: 0 }),
    surfaceGeneration({ surfaceId: "surface-b", zIndex: 1 }),
  ];
}

function proof({
  blockingGenerationIds = [],
  blockingSurfaceIds = [],
  compatibleCoverage = [],
  compatibilityProof = createSurfaceCompatibilityProof({
    compatibleForActiveDomIsland: true,
    compatibleForClipChain: true,
    compatibleForHitTesting: true,
    compatibleForMotion: true,
    compatibleForSourceWindow: true,
    compatibleForVisuals: true,
    rejectedCandidates: [],
  }),
  exactCoverage = [coverageEntry()],
  trueHoleRects = [],
}: {
  readonly blockingGenerationIds?: readonly SurfaceGenerationId[];
  readonly blockingSurfaceIds?: readonly SurfaceId[];
  readonly compatibleCoverage?: readonly SurfaceCoverageEntry[];
  readonly compatibilityProof?: SurfaceCoverageProof["compatibilityProof"];
  readonly exactCoverage?: readonly SurfaceCoverageEntry[];
  readonly trueHoleRects?: readonly ReturnType<typeof rect>[];
} = {}): SurfaceCoverageProof {
  return createSurfaceCoverageProof({
    blockingGenerationIds,
    blockingSurfaceIds,
    compatibilityProof,
    compatibleCoverage,
    exactCoverage,
    protectedResourceHandles: [],
    rendererBuckets: ["retained-content", "retained-overlay"],
    trueHoleRects,
    visibleRects: [rect()],
    zOrder: ["surface-a", "surface-b"],
  });
}

function coverageEntry({
  fidelity = "exact",
  generation = surfaceGeneration({ surfaceId: "surface-a" }),
}: {
  readonly fidelity?: SurfaceCoverageEntry["fidelity"];
  readonly generation?: SurfaceGeneration;
} = {}): SurfaceCoverageEntry {
  if (fidelity === "exact") {
    return createExactSurfaceCoverageEntry({
      generation,
      resourceHandles: [{ id: generation.generationId, kind: "texture" }],
    });
  }
  return {
    ...createExactSurfaceCoverageEntry({
      generation,
      resourceHandles: [{ id: generation.generationId, kind: "texture" }],
    }),
    fidelity,
  };
}

function surfaceGeneration({
  activeDomIsland = null,
  generationId = "generation-1",
  surfaceId = "surface-a",
  zIndex = 0,
}: {
  readonly activeDomIsland?: SurfaceActiveDomIslandGeneration | null;
  readonly generationId?: SurfaceGenerationId;
  readonly surfaceId?: SurfaceId;
  readonly zIndex?: number;
}): SurfaceGeneration {
  return createSurfaceGeneration({
    activeDomIsland,
    clipRect: rect(),
    contentVersion: 1,
    fidelity: "exact",
    flowRect: rect(),
    generationId,
    hitIndex: { entries: [], generationId },
    paintReadiness: "ready",
    rendererBucket: zIndex === 0 ? "retained-content" : "retained-overlay",
    sourceKey: "source",
    sourceWindow: {
      contentToTextureKey: "identity",
      sourceRect: rect(),
    },
    surfaceId,
    textureReadiness: "ready",
    visualVersion: 1,
    zIndex,
  });
}

function activeIsland(): SurfaceActiveDomIslandGeneration {
  return {
    focusIdentity: "input-a",
    generationId: "generation-1",
    islandId: "island-a",
    ownerSurfaceId: "surface-a",
    rect: rect({ height: 20, width: 100 }),
  };
}

function drawCommand({
  generationId = "generation-1",
  rendererBucket = "retained-content",
  surfaceId,
  zIndex,
}: {
  readonly generationId?: SurfaceGenerationId;
  readonly rendererBucket?: SurfaceDisplayTransaction["rendererBuckets"][number];
  readonly surfaceId: SurfaceId;
  readonly zIndex: number;
}): SurfaceDisplayTransaction["drawCommands"][number] {
  return {
    coverageRect: rect(),
    generationId,
    rendererBucket,
    surfaceId,
    zIndex,
  };
}

function rect({
  height = 100,
  width = 100,
  x = 0,
  y = 0,
}: {
  readonly height?: number;
  readonly width?: number;
  readonly x?: number;
  readonly y?: number;
} = {}) {
  return { height, width, x, y };
}
