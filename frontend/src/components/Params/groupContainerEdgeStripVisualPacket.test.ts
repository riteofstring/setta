import { HandlePosition } from "forks/xyflow/core/types";
import { describe, expect, it } from "vitest";
import { buildLiveDictAreaEdgeStripVisualPacket } from "./groupContainerEdgeStripVisualPacket";

describe("buildLiveDictAreaEdgeStripVisualPacket", () => {
  it("lifts the edge-strip renderer packet into deterministic scene-owned visual columns", () => {
    expect(
      buildLiveDictAreaEdgeStripVisualPacket({
        canConnect: true,
        inputPorts: [
          { id: "input-a", label: "Alpha In" },
          { id: "input-b", label: "Beta In" },
        ],
        isSelectingParams: true,
        outputPorts: [{ id: "output-a", label: "Result" }],
        rendererPacket: {
          blockId: "edges",
          estimatedHeight: 112,
          inputPortCount: 2,
          kind: "edge-strip",
          mount: {
            frameId: "dict-area-block:edges",
            mountKind: "fixed",
            orderIndex: 0,
            shouldMeasureAsFixed: true,
          },
          outputPortCount: 1,
          portRowCount: 2,
          title: "Edges",
        },
        selectedParamIds: ["input-b"],
        shouldRoundBottom: true,
      }),
    ).toEqual({
      blockId: "edges",
      canConnect: true,
      estimatedHeight: 112,
      inputColumn: {
        ports: [
          {
            handlePosition: HandlePosition.Left,
            handleType: "target",
            id: "input-a",
            isSelectable: true,
            isSelected: false,
            label: "Alpha In",
            side: "in",
          },
          {
            handlePosition: HandlePosition.Left,
            handleType: "target",
            id: "input-b",
            isSelectable: true,
            isSelected: true,
            label: "Beta In",
            side: "in",
          },
        ],
        title: "In",
      },
      inputPortCount: 2,
      kind: "edge-strip",
      mount: {
        frameId: "dict-area-block:edges",
        mountKind: "fixed",
        orderIndex: 0,
        shouldMeasureAsFixed: true,
      },
      outputColumn: {
        ports: [
          {
            handlePosition: HandlePosition.Right,
            handleType: "source",
            id: "output-a",
            label: "Result",
            side: "out",
          },
        ],
        title: "Out",
      },
      outputPortCount: 1,
      portRowCount: 2,
      shouldRoundBottom: true,
      title: "Edges",
    });
  });

  it("does not invent an edge-strip visual packet when both sides are empty", () => {
    expect(
      buildLiveDictAreaEdgeStripVisualPacket({
        canConnect: false,
        inputPorts: [],
        isSelectingParams: false,
        outputPorts: [],
        rendererPacket: {
          blockId: "edges",
          estimatedHeight: 48,
          inputPortCount: 0,
          kind: "edge-strip",
          mount: {
            frameId: "dict-area-block:edges",
            mountKind: "fixed",
            orderIndex: 0,
            shouldMeasureAsFixed: true,
          },
          outputPortCount: 0,
          portRowCount: 0,
          title: "Edges",
        },
        selectedParamIds: [],
        shouldRoundBottom: false,
      }),
    ).toBeNull();
  });
});
