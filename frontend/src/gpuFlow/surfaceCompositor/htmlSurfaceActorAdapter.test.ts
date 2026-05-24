import { describe, expect, it } from "vitest";

import { createHtmlSurfaceActorCoverageSnapshot } from "./htmlSurfaceActorAdapter";

describe("html surface actor adapter", () => {
  it("creates immutable DOM surface generations with exact texture coverage", () => {
    const snapshot = createHtmlSurfaceActorCoverageSnapshot({
      actorKind: "dom-section",
      layouts: [
        {
          height: 80,
          rendererBucket: "dom-section",
          sourcePolicy: "layoutsubtree-dom",
          surfaceId: "node-a",
          textureContentKey: "content-a",
          width: 120,
          x: 10,
          y: 20,
          zIndex: 2,
        },
      ],
      textureBySurfaceId: new Map([
        [
          "node-a",
          {
            lastUploadFrame: 4,
            surfaceId: "node-a",
            textureContentKey: "content-a",
          },
        ],
      ]),
    });

    expect(snapshot.actorSnapshots).toHaveLength(1);
    expect(snapshot.actorSnapshots[0]?.actor).toMatchObject({
      kind: "dom-section",
      sourcePolicy: "layoutsubtree-dom",
      surfaceId: "node-a",
    });
    expect(snapshot.coverageProof.trueHoleRects).toHaveLength(0);
    expect(snapshot.coverageProof.exactCoverage).toHaveLength(1);
    expect(snapshot.coverageProof.protectedResourceHandles).toEqual([
      expect.objectContaining({
        kind: "texture",
        reason: "published-transaction",
      }),
    ]);
  });

  it("reports missing overlay texture coverage as transaction-blocking true holes", () => {
    const snapshot = createHtmlSurfaceActorCoverageSnapshot({
      actorKind: "edge-label",
      layouts: [
        {
          height: 24,
          rendererBucket: "edge-label",
          sourcePolicy: "layoutsubtree-dom",
          surfaceId: "edge-label-a",
          width: 96,
          x: 30,
          y: 40,
          zIndex: 9,
        },
      ],
      textureBySurfaceId: new Map(),
    });

    expect(snapshot.coverageProof.trueHoleRects).toEqual([
      { height: 24, width: 96, x: 30, y: 40 },
    ]);
    expect(snapshot.coverageProof.blockingSurfaceIds).toEqual(["edge-label-a"]);
    expect(snapshot.coverageProof.blockingGenerationIds[0]).toContain(
      "edge-label-a",
    );
  });
});
