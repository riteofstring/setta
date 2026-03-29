import { SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { buildLiveDictAreaBoundary } from "./groupContainerLiveDictAreaBoundary";
import { buildLiveDictAreaSceneBoundary } from "./groupContainerLiveDictAreaSceneBoundary";
import {
  buildLiveDictAreaPixiFixedMeasurements,
  buildLiveDictAreaPixiLayout,
  LIVE_DICT_AREA_PIXI_COMPACT_SINGLE_ROW_MIN_HEIGHT,
  LIVE_DICT_AREA_PIXI_LAYOUT,
} from "./liveDictAreaPixiLayout";

describe("buildLiveDictAreaPixiLayout", () => {
  it("turns the live dict-area scene boundary into ordered Pixi block layouts", () => {
    const liveDictAreaBoundary = buildLiveDictAreaBoundary({
      bgColor: "bg-surface",
      canConnect: true,
      edgeInputParams: [],
      hideUnpinnedParams: false,
      paramFilter: "",
      getParamDisplayName: (paramId: string) =>
        (
          ({
            "pinned-group": "Pinned Group",
            "pinned-value": "Pinned Value",
            "unpinned-group": "Unpinned Group",
            "unpinned-value": "Unpinned Value",
          }) as Record<string, string>
        )[paramId] ?? paramId,
      getParamValuePreview: (paramId: string) =>
        (
          ({
            "pinned-value": "42",
            "unpinned-value": "1.0",
          }) as Record<string, string>
        )[paramId] ?? null,
      inputPorts: [{ id: "input-a", label: "Input A" }],
      isSelectingParams: true,
      outputPorts: [{ id: "output-a", label: "Output A" }],
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
        configuredMinHeight: 96,
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

    const liveDictAreaSceneBoundary = buildLiveDictAreaSceneBoundary({
      liveDictAreaBoundary,
    });
    const result = buildLiveDictAreaPixiLayout({
      liveDictAreaSceneBoundary,
      width: 420,
    });

    expect(result.canvasWidth).toBe(420);
    expect(result.blocks.map((block) => block.blockId)).toEqual([
      "edges",
      "pinned",
      "unpinned",
    ]);
    expect(result.totalRowCount).toBe(4);
    expect(result.valuePreviewCount).toBe(2);
    expect(result.edgeStrip?.inputPorts[0]).toMatchObject({
      id: "input-a",
      isSelected: true,
      label: "Input A",
      side: "in",
    });
    expect(result.paramAreas.map((paramArea) => paramArea.title)).toEqual([
      "Pinned Params",
      "Params",
    ]);
    expect(result.paramAreas[0]?.rows.map((row) => row.labelText)).toEqual([
      "Pinned Group",
      "Pinned Value",
    ]);
    expect(result.paramAreas[0]?.rows[1]).toMatchObject({
      valueText: "42",
    });
    expect(result.paramAreas[1]?.height).toBeGreaterThanOrEqual(96);
  });

  it("exposes fixed-height scene measurements for the non-grow Pixi canary blocks", () => {
    const liveDictAreaBoundary = buildLiveDictAreaBoundary({
      bgColor: "bg-surface",
      canConnect: true,
      edgeInputParams: [],
      hideUnpinnedParams: false,
      paramFilter: "",
      getParamDisplayName: (paramId: string) => paramId,
      getParamValuePreview: (paramId: string) => paramId,
      inputPorts: [{ id: "input-a", label: "Input A" }],
      isSelectingParams: false,
      outputPorts: [{ id: "output-a", label: "Output A" }],
      pinned: {
        requiredParamIdsToPaths: {
          "pinned-value": ["pinned-value"],
        },
        topLevelParamIds: ["pinned-value"],
      },
      positionAndSizeLocked: false,
      sectionTypeName: SectionTypeEnum.Dict,
      selectedParamIds: [],
      styleColor: null,
      unpinned: {
        canEditLayout: true,
        configuredMinHeight: 96,
        pinnedRequiredParamIdsToPaths: {},
        pinnedTopLevelParamIds: [],
        positionAndSizeLocked: false,
        requiredParamIdsToPaths: {
          "unpinned-value": ["unpinned-value"],
        },
        topLevelParamIds: ["unpinned-value"],
      },
    });
    const liveDictAreaSceneBoundary = buildLiveDictAreaSceneBoundary({
      liveDictAreaBoundary,
    });

    expect(
      buildLiveDictAreaPixiFixedMeasurements({
        liveDictAreaSceneBoundary,
      }),
    ).toEqual([
      expect.objectContaining({ blockId: "edges", height: expect.any(Number) }),
      expect.objectContaining({
        blockId: "pinned",
        height: expect.any(Number),
      }),
    ]);
  });

  it("keeps the full Pixi canvas height for the mounted settings card stack", () => {
    const liveDictAreaBoundary = buildLiveDictAreaBoundary({
      bgColor: "bg-surface",
      canConnect: true,
      edgeInputParams: [],
      hideUnpinnedParams: false,
      paramFilter: "",
      getParamDisplayName: (paramId: string) => paramId,
      getParamValuePreview: (paramId: string) => paramId,
      inputPorts: [{ id: "input-a", label: "Input A" }],
      isSelectingParams: false,
      outputPorts: [{ id: "output-a", label: "Output A" }],
      pinned: {
        requiredParamIdsToPaths: {
          "pinned-value": ["pinned-value"],
        },
        topLevelParamIds: ["pinned-value"],
      },
      positionAndSizeLocked: false,
      sectionTypeName: SectionTypeEnum.Dict,
      selectedParamIds: [],
      styleColor: null,
      unpinned: {
        canEditLayout: true,
        configuredMinHeight: 96,
        pinnedRequiredParamIdsToPaths: {},
        pinnedTopLevelParamIds: [],
        positionAndSizeLocked: false,
        requiredParamIdsToPaths: {
          "unpinned-value": ["unpinned-value"],
        },
        topLevelParamIds: ["unpinned-value"],
      },
    });
    const liveDictAreaSceneBoundary = buildLiveDictAreaSceneBoundary({
      liveDictAreaBoundary,
    });
    const result = buildLiveDictAreaPixiLayout({
      liveDictAreaSceneBoundary,
      width: 320,
    });

    expect(result.canvasHeight).toBeGreaterThan(40);
    expect(result.canvasHeight).toBeGreaterThan(
      result.paramAreas[0]?.height ?? 0,
    );
  });

  it("fits the grow param-area rows into the mounted card-body height instead of rendering the full stack offscreen", () => {
    const liveDictAreaBoundary = buildLiveDictAreaBoundary({
      bgColor: "bg-surface",
      canConnect: true,
      edgeInputParams: [],
      hideUnpinnedParams: false,
      paramFilter: "",
      getParamDisplayName: (paramId: string) =>
        (
          ({
            "pinned-group": "Pinned Group",
            "pinned-value": "Pinned Value",
            "unpinned-group": "Unpinned Group",
            "unpinned-value": "Unpinned Value",
          }) as Record<string, string>
        )[paramId] ?? paramId,
      getParamValuePreview: (paramId: string) =>
        paramId === "unpinned-value" ? "42" : null,
      inputPorts: [{ id: "input-a", label: "Input A" }],
      isSelectingParams: false,
      outputPorts: [{ id: "output-a", label: "Output A" }],
      pinned: {
        requiredParamIdsToPaths: {
          "pinned-value": ["pinned-group", "pinned-value"],
        },
        topLevelParamIds: ["pinned-group"],
      },
      positionAndSizeLocked: false,
      sectionTypeName: SectionTypeEnum.Dict,
      selectedParamIds: [],
      styleColor: null,
      unpinned: {
        canEditLayout: true,
        configuredMinHeight: 96,
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
    const liveDictAreaSceneBoundary = buildLiveDictAreaSceneBoundary({
      liveDictAreaBoundary,
    });
    const fullLayout = buildLiveDictAreaPixiLayout({
      liveDictAreaSceneBoundary,
      width: 320,
    });
    const constrainedLayout = buildLiveDictAreaPixiLayout({
      liveDictAreaSceneBoundary,
      maxCanvasHeight: (fullLayout.paramAreas[1]?.y ?? 0) + 64,
      width: 320,
    });

    expect(constrainedLayout.canvasHeight).toBe(
      (fullLayout.paramAreas[1]?.y ?? 0) + 64,
    );
    expect(constrainedLayout.paramAreas[1]?.height).toBe(64);
    expect(constrainedLayout.paramAreas[1]?.rows.map((row) => row.id)).toEqual([
      "unpinned-group",
      "unpinned-value",
    ]);
    expect(constrainedLayout.totalRowCount).toBe(4);
    expect(constrainedLayout.valuePreviewCount).toBe(1);
  });

  it("drops the synthetic unpinned detail header strip without shrinking the preserved body height", () => {
    const liveDictAreaBoundary = buildLiveDictAreaBoundary({
      bgColor: "bg-surface",
      canConnect: true,
      edgeInputParams: [],
      hideUnpinnedParams: false,
      paramFilter: "",
      getParamDisplayName: (paramId: string) =>
        (
          ({
            "unpinned-group": "Unpinned Group",
            "unpinned-value": "Unpinned Value",
          }) as Record<string, string>
        )[paramId] ?? paramId,
      getParamValuePreview: (paramId: string) =>
        paramId === "unpinned-value" ? "42" : null,
      inputPorts: [],
      isSelectingParams: false,
      outputPorts: [],
      pinned: {
        requiredParamIdsToPaths: {},
        topLevelParamIds: [],
      },
      positionAndSizeLocked: false,
      sectionTypeName: SectionTypeEnum.Dict,
      selectedParamIds: [],
      styleColor: null,
      unpinned: {
        canEditLayout: true,
        configuredMinHeight: 0,
        pinnedRequiredParamIdsToPaths: {},
        pinnedTopLevelParamIds: [],
        positionAndSizeLocked: false,
        requiredParamIdsToPaths: {
          "unpinned-group": ["unpinned-group"],
          "unpinned-value": ["unpinned-group", "unpinned-value"],
        },
        topLevelParamIds: ["unpinned-group"],
      },
    });
    const liveDictAreaSceneBoundary = buildLiveDictAreaSceneBoundary({
      liveDictAreaBoundary,
    });
    const result = buildLiveDictAreaPixiLayout({
      liveDictAreaSceneBoundary,
      width: 320,
    });

    expect(result.paramAreas[0]).toMatchObject({
      headerHeight: 0,
      height:
        LIVE_DICT_AREA_PIXI_LAYOUT.areaHeaderHeight +
        LIVE_DICT_AREA_PIXI_LAYOUT.areaPaddingTop +
        2 * LIVE_DICT_AREA_PIXI_LAYOUT.rowHeight +
        LIVE_DICT_AREA_PIXI_LAYOUT.areaPaddingBottom,
    });
    expect(result.paramAreas[0]?.rows.map((row) => row.id)).toEqual([
      "unpinned-group",
      "unpinned-value",
    ]);
    expect(result.paramAreas[0]?.rows[0]?.y).toBe(
      LIVE_DICT_AREA_PIXI_LAYOUT.areaPaddingTop +
        LIVE_DICT_AREA_PIXI_LAYOUT.rowTopOffset,
    );
  });

  it("switches short mounted preview cards into a compact param-area mode so they still show a visible row", () => {
    const liveDictAreaBoundary = buildLiveDictAreaBoundary({
      bgColor: "bg-surface",
      canConnect: true,
      edgeInputParams: [],
      hideUnpinnedParams: false,
      paramFilter: "",
      getParamDisplayName: (paramId: string) =>
        (
          ({
            "unpinned-group": "Unpinned Group",
            "unpinned-value": "Unpinned Value",
          }) as Record<string, string>
        )[paramId] ?? paramId,
      getParamValuePreview: (paramId: string) =>
        paramId === "unpinned-value" ? "42" : null,
      inputPorts: [],
      isSelectingParams: false,
      outputPorts: [],
      pinned: {
        requiredParamIdsToPaths: {},
        topLevelParamIds: [],
      },
      positionAndSizeLocked: false,
      sectionTypeName: SectionTypeEnum.Dict,
      selectedParamIds: [],
      styleColor: null,
      unpinned: {
        canEditLayout: true,
        configuredMinHeight: 0,
        pinnedRequiredParamIdsToPaths: {},
        pinnedTopLevelParamIds: [],
        positionAndSizeLocked: false,
        requiredParamIdsToPaths: {
          "unpinned-group": ["unpinned-group"],
          "unpinned-value": ["unpinned-group", "unpinned-value"],
        },
        topLevelParamIds: ["unpinned-group"],
      },
    });
    const liveDictAreaSceneBoundary = buildLiveDictAreaSceneBoundary({
      liveDictAreaBoundary,
    });
    const fullLayout = buildLiveDictAreaPixiLayout({
      liveDictAreaSceneBoundary,
      width: 320,
    });
    const constrainedLayout = buildLiveDictAreaPixiLayout({
      liveDictAreaSceneBoundary,
      maxCanvasHeight: (fullLayout.paramAreas[0]?.y ?? 0) + 29,
      width: 320,
    });

    expect(constrainedLayout.paramAreas[0]?.height).toBe(29);
    expect(constrainedLayout.paramAreas[0]?.headerHeight).toBe(0);
    expect(constrainedLayout.paramAreas[0]?.rows.map((row) => row.id)).toEqual([
      "unpinned-group",
    ]);
    expect(constrainedLayout.totalRowCount).toBe(1);
  });

  it("reserves a readable compact preview after a constrained edge strip so short cards do not render as empty shells", () => {
    const liveDictAreaBoundary = buildLiveDictAreaBoundary({
      bgColor: "bg-surface",
      canConnect: true,
      edgeInputParams: [],
      hideUnpinnedParams: false,
      paramFilter: "",
      getParamDisplayName: (paramId: string) =>
        (
          ({
            "unpinned-group": "Unpinned Group",
            "unpinned-value": "Unpinned Value",
          }) as Record<string, string>
        )[paramId] ?? paramId,
      getParamValuePreview: (paramId: string) =>
        paramId === "unpinned-value" ? "42" : null,
      inputPorts: [{ id: "input-a", label: "Input A" }],
      isSelectingParams: false,
      outputPorts: [{ id: "output-a", label: "Output A" }],
      pinned: {
        requiredParamIdsToPaths: {},
        topLevelParamIds: [],
      },
      positionAndSizeLocked: false,
      sectionTypeName: SectionTypeEnum.Dict,
      selectedParamIds: [],
      styleColor: null,
      unpinned: {
        canEditLayout: true,
        configuredMinHeight: 0,
        pinnedRequiredParamIdsToPaths: {},
        pinnedTopLevelParamIds: [],
        positionAndSizeLocked: false,
        requiredParamIdsToPaths: {
          "unpinned-group": ["unpinned-group"],
          "unpinned-value": ["unpinned-group", "unpinned-value"],
        },
        topLevelParamIds: ["unpinned-group"],
      },
    });
    const liveDictAreaSceneBoundary = buildLiveDictAreaSceneBoundary({
      liveDictAreaBoundary,
    });
    const fullLayout = buildLiveDictAreaPixiLayout({
      liveDictAreaSceneBoundary,
      width: 320,
    });
    const constrainedLayout = buildLiveDictAreaPixiLayout({
      liveDictAreaSceneBoundary,
      maxCanvasHeight:
        (fullLayout.edgeStrip?.height ?? 0) +
        LIVE_DICT_AREA_PIXI_LAYOUT.areaGap +
        LIVE_DICT_AREA_PIXI_COMPACT_SINGLE_ROW_MIN_HEIGHT +
        LIVE_DICT_AREA_PIXI_LAYOUT.rowHeight -
        1,
      width: 320,
    });

    expect(constrainedLayout.edgeStrip?.height).toBeLessThan(
      fullLayout.edgeStrip?.height ?? 0,
    );
    expect(constrainedLayout.paramAreas[0]?.rows.map((row) => row.id)).toEqual([
      "unpinned-group",
      "unpinned-value",
    ]);
    expect(constrainedLayout.totalRowCount).toBe(2);
  });
});
