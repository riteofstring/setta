import { describe, expect, it } from "vitest";
import { buildLiveDictAreaEdgeStripPainterPacket } from "./groupContainerEdgeStripPainterPacket";

describe("buildLiveDictAreaEdgeStripPainterPacket", () => {
  it("lifts the edge-strip draw packet into a stable painter packet", () => {
    expect(
      buildLiveDictAreaEdgeStripPainterPacket({
        drawPacket: {
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
