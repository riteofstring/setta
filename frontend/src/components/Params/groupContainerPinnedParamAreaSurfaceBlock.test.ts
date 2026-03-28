import { SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it, vi } from "vitest";
import { buildLiveDictAreaBoundary } from "./groupContainerLiveDictAreaBoundary";
import {
  buildLiveDictAreaPinnedParamAreaSurfaceBlock,
} from "./groupContainerPinnedParamAreaSurfaceBlock";
import {
  buildLiveDictAreaRenderer,
} from "./groupContainerLiveDictAreaRenderer";
import type { LiveDictAreaPinnedParamAreaRendererBlock } from "./groupContainerPinnedParamAreaRendererBlock";

describe("buildLiveDictAreaPinnedParamAreaSurfaceBlock", () => {
  it("lifts the pinned param-area renderer block into component-facing surface props", () => {
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
    const pinnedParamAreaBlock = liveDictAreaRenderer.blocks.find(
      (block): block is LiveDictAreaPinnedParamAreaRendererBlock =>
        block.kind === "pinned-param-area",
    );

    if (!pinnedParamAreaBlock) {
      throw new Error("Expected pinned param-area renderer block");
    }

    const result = buildLiveDictAreaPinnedParamAreaSurfaceBlock({
      rendererBlock: pinnedParamAreaBlock,
    });

    expect(result).toEqual({
      key: "dict-area-block:pinned",
      kind: "pinned-param-area",
      props: {
        domPacket: pinnedParamAreaBlock.domPacket,
        handleColumnResizeStart,
        sectionId: "section-1",
      },
    });
  });
});
