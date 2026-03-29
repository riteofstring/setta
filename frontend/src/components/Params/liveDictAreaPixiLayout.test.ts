import { SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { buildLiveDictAreaBoundary } from "./groupContainerLiveDictAreaBoundary";
import { buildLiveDictAreaSceneBoundary } from "./groupContainerLiveDictAreaSceneBoundary";
import {
  buildLiveDictAreaPixiFixedMeasurements,
  buildLiveDictAreaPixiLayout,
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

  it("clamps the Pixi canvas height to the mounted preview-card height", () => {
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
    const unclamped = buildLiveDictAreaPixiLayout({
      liveDictAreaSceneBoundary,
      width: 320,
    });
    const clamped = buildLiveDictAreaPixiLayout({
      liveDictAreaSceneBoundary,
      maxCanvasHeight: unclamped.canvasHeight - 40,
      width: 320,
    });

    expect(unclamped.canvasHeight).toBeGreaterThan(40);
    expect(clamped.canvasHeight).toBe(unclamped.canvasHeight - 40);
  });
});
