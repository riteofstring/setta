import { describe, expect, it } from "vitest";

import type { GpuRetainedContentRow } from "../retainedContentSceneTypes";
import type { GpuDomIsland } from "../scene";
import { createGpuFlowRetainedRuntimeFrameSourceSignature } from "./flowMountedSceneNodes";
import type { GpuFlowNodeLayerState } from "./flowLayerState";

describe("GPU flow mounted scene node signatures", () => {
  it("invalidates retained runtime reuse when a retained DOM control becomes active", () => {
    const inactiveSignature = createGpuFlowRetainedRuntimeFrameSourceSignature({
      layer: layerWithRows([retainedRow({ active: false })]),
      nodeElementById: new Map(),
    });
    const activeSignature = createGpuFlowRetainedRuntimeFrameSourceSignature({
      layer: layerWithRows([retainedRow({ active: true })]),
      nodeElementById: new Map(),
    });

    expect(activeSignature).not.toBe(inactiveSignature);
  });

  it("invalidates retained runtime reuse when native DOM islands change", () => {
    const inactiveSignature = createGpuFlowRetainedRuntimeFrameSourceSignature({
      layer: layerWithRows([]),
      nodeElementById: new Map(),
    });
    const activeSignature = createGpuFlowRetainedRuntimeFrameSourceSignature({
      layer: layerWithRows([], [nativeDomIsland()]),
      nodeElementById: new Map(),
    });

    expect(activeSignature).not.toBe(inactiveSignature);
  });
});

function layerWithRows(
  rows: readonly GpuRetainedContentRow[],
  domIslands: readonly GpuDomIsland[] = [],
): GpuFlowNodeLayerState {
  return {
    scene: {
      contentSurfaces: [
        {
          clipRect: { height: 100, width: 100, x: 0, y: 0 },
          id: "surface",
          ownerSectionId: "section",
          rect: { height: 100, width: 100, x: 0, y: 0 },
          retainedScene: {
            rows,
          },
          renderer: { kind: "canvas-content", surfaceId: "surface" },
          zIndex: 1,
        },
      ],
      domIslands,
      edges: [],
      revision: 1,
      sections: [],
    },
    viewport: [0, 0, 1],
  } as unknown as GpuFlowNodeLayerState;
}

function retainedRow({
  active,
}: {
  readonly active: boolean;
}): GpuRetainedContentRow {
  return {
    control: { kind: "text-like" },
    id: "row",
    state: {
      domControlActivation: active
        ? {
            clientPoint: { x: 12, y: 24 },
            kind: "pointer",
          }
        : null,
      nativeControlActive: active,
      nativeLabelActive: false,
    },
  } as GpuRetainedContentRow;
}

function nativeDomIsland(): GpuDomIsland {
  return {
    clipOwnerId: "surface",
    contentRect: { height: 10, width: 20, x: 0, y: 0 },
    id: "island",
    kind: "retained-content-control",
    ownerSectionId: "section",
    rect: { height: 10, width: 20, x: 1, y: 2 },
    source: {
      hitRecordId: "control:row",
      kind: "retained-content",
      ownerRowId: "row",
      surfaceId: "surface",
    },
    zIndex: 2,
  };
}
