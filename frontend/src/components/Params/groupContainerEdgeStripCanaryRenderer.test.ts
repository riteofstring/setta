import { describe, expect, it } from "vitest";
import { buildLiveDictAreaEdgeStripCanaryRenderer } from "./groupContainerEdgeStripCanaryRenderer";

describe("buildLiveDictAreaEdgeStripCanaryRenderer", () => {
  it("lifts the live edge-strip canary view into one explicit renderer block", () => {
    const canaryView = {
      blockId: "edges",
      domPacket: {
        bgColor: "bg-surface",
        blockId: "edges",
        kind: "edge-strip" as const,
        mount: {
          frameId: "dict-area-block:edges",
          mountKind: "fixed" as const,
          orderIndex: 0,
          shouldMeasureAsFixed: true,
        },
        positionAndSizeLocked: false,
        styleColor: "amber",
        visualPacket: {
          blockId: "edges",
          canConnect: true,
          estimatedHeight: 72,
          inputColumn: {
            ports: [],
            title: "In",
          },
          inputPortCount: 0,
          kind: "edge-strip" as const,
          mount: {
            frameId: "dict-area-block:edges",
            mountKind: "fixed" as const,
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
      kind: "edge-strip" as const,
      mount: {
        frameId: "dict-area-block:edges",
        mountKind: "fixed" as const,
        orderIndex: 0,
        shouldMeasureAsFixed: true,
      },
      scenePacket: {
        canConnect: true,
        inputPortCount: 1,
        inputPorts: [{ id: "input-a", label: "Input A" }],
        isSelectingParams: false,
        outputPortCount: 1,
        outputPorts: [{ id: "output-a", label: "Output A" }],
        selectedParamIds: ["input-a"],
      },
    };

    expect(
      buildLiveDictAreaEdgeStripCanaryRenderer({
        canaryView,
      }),
    ).toEqual({
      ...canaryView,
      canaryView,
      key: "dict-area-block:edges",
    });
  });
});
