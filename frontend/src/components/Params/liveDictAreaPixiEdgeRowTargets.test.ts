import { SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it, vi } from "vitest";
import { buildLiveDictAreaMountBoundary } from "./groupContainerLiveDictAreaMountBoundary";
import { buildLiveDictAreaPixiEdgeRowTargets } from "./liveDictAreaPixiEdgeRowTargets";
import { buildLiveDictAreaPixiLayout } from "./liveDictAreaPixiLayout";

describe("buildLiveDictAreaPixiEdgeRowTargets", () => {
  it("builds selectable input-row targets from the live edge-strip block", () => {
    const liveDictAreaMountBoundary = buildLiveDictAreaMountBoundary({
      input: {
        bgColor: "bg-transparent",
        canConnect: true,
        edgeInputParams: [{ id: "edge-input-a", label: "Edge Input A" }],
        getParamDisplayName: (paramId: string) =>
          (
            ({
              "pinned-group": "Pinned Group",
              "pinned-value": "Pinned Value",
            }) as Record<string, string>
          )[paramId] ?? paramId,
        getParamEditorKind: () => "other",
        getParamValuePresentationKind: () => "text",
        handleColumnResizeStart: vi.fn(),
        hideUnpinnedParams: false,
        inputPorts: [{ id: "edge-input-a", label: "Edge Input A" }],
        isSelectingParams: true,
        outputPorts: [{ id: "edge-output-a", label: "Edge Output A" }],
        paramFilter: "",
        pinned: {
          requiredParamIdsToPaths: {
            "pinned-value": ["pinned-group", "pinned-value"],
          },
          topLevelParamIds: ["pinned-group"],
        },
        positionAndSizeLocked: false,
        sectionId: "section-edge-targets",
        sectionTypeName: SectionTypeEnum.Dict,
        selectedParamIds: ["edge-input-a"],
        styleColor: null,
        unpinned: {
          canEditLayout: true,
          configuredMinHeight: 80,
          pinnedRequiredParamIdsToPaths: {
            "pinned-value": ["pinned-group", "pinned-value"],
          },
          pinnedTopLevelParamIds: ["pinned-group"],
          positionAndSizeLocked: false,
          requiredParamIdsToPaths: {},
          topLevelParamIds: [],
        },
      },
    });
    const layout = buildLiveDictAreaPixiLayout({
      liveDictAreaSceneBoundary:
        liveDictAreaMountBoundary.liveDictAreaSceneBoundary,
      maxCanvasHeight: 600,
      width: 320,
    });

    const result = buildLiveDictAreaPixiEdgeRowTargets({
      layout,
      liveDictAreaMountProps: liveDictAreaMountBoundary.liveDictAreaMountProps,
      liveDictAreaSceneBoundary:
        liveDictAreaMountBoundary.liveDictAreaSceneBoundary,
    });

    expect(result).toEqual([
      expect.objectContaining({
        blockId: "edges",
        isSelected: true,
        label: "Edge Input A",
        portId: "edge-input-a",
        sectionId: "section-edge-targets",
      }),
    ]);
    expect(result[0]?.width ?? 0).toBeGreaterThan(0);
    expect(result[0]?.height ?? 0).toBeGreaterThan(0);
  });

  it("skips non-selectable edge rows", () => {
    const liveDictAreaMountBoundary = buildLiveDictAreaMountBoundary({
      input: {
        bgColor: "bg-transparent",
        canConnect: true,
        edgeInputParams: [{ id: "edge-input-a", label: "Edge Input A" }],
        getParamDisplayName: (paramId: string) => paramId,
        getParamEditorKind: () => "other",
        getParamValuePresentationKind: () => "text",
        handleColumnResizeStart: vi.fn(),
        hideUnpinnedParams: false,
        inputPorts: [{ id: "edge-input-a", label: "Edge Input A" }],
        isSelectingParams: false,
        outputPorts: [],
        paramFilter: "",
        pinned: {
          requiredParamIdsToPaths: {},
          topLevelParamIds: [],
        },
        positionAndSizeLocked: false,
        sectionId: "section-edge-targets",
        sectionTypeName: SectionTypeEnum.Dict,
        selectedParamIds: [],
        styleColor: null,
        unpinned: {
          canEditLayout: true,
          configuredMinHeight: 80,
          pinnedRequiredParamIdsToPaths: {},
          pinnedTopLevelParamIds: [],
          positionAndSizeLocked: false,
          requiredParamIdsToPaths: {},
          topLevelParamIds: [],
        },
      },
    });

    const result = buildLiveDictAreaPixiEdgeRowTargets({
      liveDictAreaMountProps: liveDictAreaMountBoundary.liveDictAreaMountProps,
      liveDictAreaSceneBoundary:
        liveDictAreaMountBoundary.liveDictAreaSceneBoundary,
    });

    expect(result).toEqual([]);
  });
});
