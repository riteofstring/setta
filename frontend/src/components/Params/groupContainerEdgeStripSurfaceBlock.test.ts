import { SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it, vi } from "vitest";
import { buildLiveDictAreaEdgeStripSurfaceBlock } from "./groupContainerEdgeStripSurfaceBlock";
import { buildLiveDictAreaBoundary } from "./groupContainerLiveDictAreaBoundary";
import {
  buildLiveDictAreaRenderer,
  type LiveDictAreaEdgeStripRendererBlock,
} from "./groupContainerLiveDictAreaRenderer";

describe("buildLiveDictAreaEdgeStripSurfaceBlock", () => {
  it("lifts the edge-strip renderer block into component-facing surface props", () => {
    const handleColumnResizeStart = vi.fn();
    const liveDictAreaBoundary = buildLiveDictAreaBoundary({
      bgColor: "bg-surface",
      canConnect: true,
      edgeInputParams: [],
      getParamDisplayName: (paramId: string) =>
        (
          ({
            "pinned-group": "Pinned Group",
            "pinned-value": "Pinned Value",
            "unpinned-group": "Unpinned Group",
            "unpinned-value": "Unpinned Value",
          }) as Record<string, string>
        )[paramId] ?? paramId,
      hideUnpinnedParams: false,
      inputPorts: [{ id: "input-a", label: "Input A" }],
      isSelectingParams: true,
      outputPorts: [{ id: "output-a", label: "Output A" }],
      paramFilter: "",
      pinned: {
        requiredParamIdsToPaths: {
          "pinned-value": ["pinned-group", "pinned-value"],
        },
        topLevelParamIds: ["pinned-group"],
      },
      positionAndSizeLocked: false,
      sectionTypeName: SectionTypeEnum.Dict,
      selectedParamIds: ["input-a"],
      styleColor: "amber",
      unpinned: {
        canEditLayout: true,
        configuredMinHeight: 48,
        pinnedRequiredParamIdsToPaths: {
          "pinned-value": ["pinned-group", "pinned-value"],
        },
        pinnedTopLevelParamIds: ["pinned-group"],
        positionAndSizeLocked: false,
        requiredParamIdsToPaths: {
          "unpinned-value": ["unpinned-group", "unpinned-value"],
        },
        topLevelParamIds: ["unpinned-group"],
      },
    });
    const liveDictAreaRenderer = buildLiveDictAreaRenderer({
      handleColumnResizeStart,
      liveDictAreaBoundary,
      sectionId: "section-1",
    });
    const edgeStripBlock = liveDictAreaRenderer.blocks.find(
      (block): block is LiveDictAreaEdgeStripRendererBlock =>
        block.kind === "edge-strip",
    );

    if (!edgeStripBlock) {
      throw new Error("Expected edge-strip renderer block");
    }

    const result = buildLiveDictAreaEdgeStripSurfaceBlock({
      rendererBlock: edgeStripBlock,
    });

    expect(result).toEqual({
      key: "dict-area-block:edges",
      kind: "edge-strip",
      props: {
        domPacket: edgeStripBlock.domPacket,
        sectionId: "section-1",
      },
    });
  });
});
