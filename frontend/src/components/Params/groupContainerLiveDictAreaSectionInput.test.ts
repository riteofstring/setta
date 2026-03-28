import { SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it, vi } from "vitest";
import {
  buildLiveDictAreaSectionDisplayNames,
  buildLiveDictAreaSectionInput,
} from "./groupContainerLiveDictAreaSectionInput";

describe("groupContainerLiveDictAreaSectionInput", () => {
  it("collects unique top-level and nested param display names for the live dict-area section", () => {
    const getParamDisplayName = vi.fn((paramId: string) => `${paramId}-label`);

    const result = buildLiveDictAreaSectionDisplayNames({
      getParamDisplayName,
      requiredParamIdsToPaths: {
        leaf: ["group", "leaf"],
        shared: ["group", "shared"],
      },
      topLevelParamIds: ["group", "root"],
    });

    expect(result).toEqual({
      group: "group-label",
      leaf: "leaf-label",
      root: "root-label",
      shared: "shared-label",
    });
    expect(
      new Set(getParamDisplayName.mock.calls.map(([paramId]) => paramId)),
    ).toEqual(new Set(["group", "root", "leaf", "shared"]));
    expect(getParamDisplayName).toHaveBeenCalledTimes(4);
  });

  it("builds the live dict-area section input with the existing connectability and fallback display-name rules", () => {
    const handleColumnResizeStart = vi.fn();

    const result = buildLiveDictAreaSectionInput({
      bgColor: "bg-surface",
      canEditLayout: true,
      canEditStructure: true,
      displayNamesById: {
        "edge-param": "Edge Param",
        "pinned-param": "Pinned Param",
      },
      edgeInputParams: ["edge-param"],
      edgeInputPorts: [{ id: "edge-param", label: "Edge Param" }],
      edgeOutputPorts: [{ id: "output-port", label: "Output Port" }],
      handleColumnResizeStart,
      hideUnpinnedParams: false,
      isSelectingParams: true,
      paramFilter: "pin",
      pinnedRequiredParamIdsToPaths: {
        "pinned-param": ["pinned-param"],
      },
      pinnedTopLevelParamIds: ["pinned-param"],
      positionAndSizeLocked: false,
      sectionId: "section-1",
      sectionTypeName: SectionTypeEnum.Dict,
      selectedParamIds: ["edge-param"],
      styleColor: "amber",
      unpinnedParamsAreaMinHeight: 96,
      unpinnedRequiredParamIdsToPaths: {
        "unpinned-param": ["unpinned-param"],
      },
      unpinnedTopLevelParamIds: ["unpinned-param"],
    });

    expect(result.canConnect).toBe(false);
    expect(result.handleColumnResizeStart).toBe(handleColumnResizeStart);
    expect(result.inputPorts).toEqual([
      { id: "edge-param", label: "Edge Param" },
    ]);
    expect(result.outputPorts).toEqual([
      { id: "output-port", label: "Output Port" },
    ]);
    expect(result.getParamDisplayName("edge-param")).toBe("Edge Param");
    expect(result.getParamDisplayName("missing-param")).toBe("missing-param");
    expect(result.pinned).toEqual({
      requiredParamIdsToPaths: {
        "pinned-param": ["pinned-param"],
      },
      topLevelParamIds: ["pinned-param"],
    });
    expect(result.unpinned).toEqual({
      canEditLayout: true,
      configuredMinHeight: 96,
      pinnedRequiredParamIdsToPaths: {
        "pinned-param": ["pinned-param"],
      },
      pinnedTopLevelParamIds: ["pinned-param"],
      positionAndSizeLocked: false,
      requiredParamIdsToPaths: {
        "unpinned-param": ["unpinned-param"],
      },
      topLevelParamIds: ["unpinned-param"],
    });
  });
});
