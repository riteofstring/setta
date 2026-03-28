import { describe, expect, it } from "vitest";
import { buildLiveDictAreaEdgeStripMountPacket } from "./groupContainerEdgeStripMountPacket";

describe("buildLiveDictAreaEdgeStripMountPacket", () => {
  it("lifts the edge-strip canvas packet into a stable mount packet", () => {
    expect(
      buildLiveDictAreaEdgeStripMountPacket({
        canvasPacket: {
          bgColor: "bg-surface",
          blockId: "edges",
          kind: "edge-strip",
          mount: {
            frameId: "dict-area-block:edges",
            mountKind: "fixed",
            orderIndex: 0,
            shouldMeasureAsFixed: true,
          },
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
      bgColor: "bg-surface",
      blockId: "edges",
      kind: "edge-strip",
      mount: {
        frameId: "dict-area-block:edges",
        mountKind: "fixed",
        orderIndex: 0,
        shouldMeasureAsFixed: true,
      },
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
    });
  });
});
