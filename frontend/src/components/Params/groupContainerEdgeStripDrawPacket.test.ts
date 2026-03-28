import { describe, expect, it } from "vitest";
import { buildLiveDictAreaEdgeStripDrawPacket } from "./groupContainerEdgeStripDrawPacket";

describe("buildLiveDictAreaEdgeStripDrawPacket", () => {
  it("lifts the edge-strip surface packet into a stable draw packet", () => {
    // Keep the first block-specific draw packet deterministic before broader scene drawing lands.
    expect(
      buildLiveDictAreaEdgeStripDrawPacket({
        surfacePacket: {
          bgColor: "bg-surface",
          kind: "edge-strip",
          positionAndSizeLocked: false,
          styleColor: "amber",
          visualPacket: {
            blockId: "edges",
            canConnect: true,
            estimatedHeight: 96,
            inputColumn: {
              ports: [],
              title: "In",
            },
            inputPortCount: 0,
            kind: "edge-strip",
            mount: {
              frameId: "dict-area-block:edges",
              mountKind: "fixed",
              orderIndex: 0,
              shouldMeasureAsFixed: true,
            },
            outputColumn: {
              ports: [],
              title: "Out",
            },
            outputPortCount: 0,
            portRowCount: 0,
            shouldRoundBottom: false,
            title: "Edges",
          },
        },
      }),
    ).toEqual({
      blockId: "edges",
      kind: "edge-strip",
      mount: {
        frameId: "dict-area-block:edges",
        mountKind: "fixed",
        orderIndex: 0,
        shouldMeasureAsFixed: true,
      },
      surfacePacket: {
        bgColor: "bg-surface",
        kind: "edge-strip",
        positionAndSizeLocked: false,
        styleColor: "amber",
        visualPacket: {
          blockId: "edges",
          canConnect: true,
          estimatedHeight: 96,
          inputColumn: {
            ports: [],
            title: "In",
          },
          inputPortCount: 0,
          kind: "edge-strip",
          mount: {
            frameId: "dict-area-block:edges",
            mountKind: "fixed",
            orderIndex: 0,
            shouldMeasureAsFixed: true,
          },
          outputColumn: {
            ports: [],
            title: "Out",
          },
          outputPortCount: 0,
          portRowCount: 0,
          shouldRoundBottom: false,
          title: "Edges",
        },
      },
    });
  });
});
