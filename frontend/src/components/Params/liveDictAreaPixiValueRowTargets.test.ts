import { SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it, vi } from "vitest";
import { buildLiveDictAreaMountBoundary } from "./groupContainerLiveDictAreaMountBoundary";
import { buildLiveDictAreaPixiLayout } from "./liveDictAreaPixiLayout";
import {
  buildLiveDictAreaPixiValueRowTargets,
  getLiveDictAreaPixiValueRowHandoffAriaLabel,
} from "./liveDictAreaPixiValueRowTargets";

describe("buildLiveDictAreaPixiValueRowTargets", () => {
  it("builds activatable targets only for value rows on the Pixi canary", () => {
    const liveDictAreaMountBoundary = buildLiveDictAreaMountBoundary({
      input: {
        bgColor: "bg-transparent",
        canConnect: true,
        edgeInputParams: [],
        getParamEditorKind: (paramId: string) =>
          paramId === "pinned-value" ? "combobox" : "color-picker",
        getParamDisplayName: (paramId: string) =>
          (
            ({
              "pinned-group": "Pinned Group",
              "pinned-value": "Pinned Value",
              "unpinned-group": "Unpinned Group",
              "unpinned-value": "Unpinned Value",
            }) as Record<string, string>
          )[paramId] ?? paramId,
        handleColumnResizeStart: vi.fn(),
        hideUnpinnedParams: false,
        inputPorts: [{ id: "input-a", label: "Input A" }],
        isSelectingParams: false,
        outputPorts: [{ id: "output-a", label: "Output A" }],
        paramFilter: "",
        pinned: {
          requiredParamIdsToPaths: {
            "pinned-value": ["pinned-group", "pinned-value"],
          },
          topLevelParamIds: ["pinned-group"],
        },
        positionAndSizeLocked: false,
        sectionId: "section-1",
        sectionTypeName: SectionTypeEnum.Dict,
        selectedParamIds: [],
        styleColor: null,
        unpinned: {
          canEditLayout: true,
          configuredMinHeight: 80,
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
      },
    });

    const targets = buildLiveDictAreaPixiValueRowTargets({
      liveDictAreaMountProps: liveDictAreaMountBoundary.liveDictAreaMountProps,
      liveDictAreaSceneBoundary:
        liveDictAreaMountBoundary.liveDictAreaSceneBoundary,
    });

    expect(targets).toHaveLength(2);
    expect(targets.map((target) => target.editorKind)).toEqual([
      "combobox",
      "color-picker",
    ]);
    expect(targets.map((target) => target.rowId)).toEqual([
      "pinned-value",
      "unpinned-value",
    ]);
    expect(targets.map((target) => target.blockId)).toEqual([
      "pinned",
      "unpinned",
    ]);
    expect(targets[0]?.requiredParamIdsToPaths).toEqual({
      "pinned-value": ["pinned-group", "pinned-value"],
    });
    expect(targets[1]?.requiredParamIdsToPaths).toEqual({
      "unpinned-value": ["unpinned-group", "unpinned-value"],
    });
    expect(targets[0]?.sectionId).toBe("section-1");
    expect(targets[0]?.label).toBe("Pinned Value");
    expect(targets[1]?.label).toBe("Unpinned Value");
    expect(targets[0]?.width).toBe(296);
    expect(targets[1]?.width).toBe(296);
    expect(targets[0]?.y).toBeLessThan(targets[1]?.y ?? 0);
  });

  it("can reuse the mounted constrained scene layout so hidden value rows do not keep stale targets", () => {
    const liveDictAreaMountBoundary = buildLiveDictAreaMountBoundary({
      input: {
        bgColor: "bg-transparent",
        canConnect: true,
        edgeInputParams: [],
        getParamEditorKind: (paramId: string) =>
          paramId === "pinned-value" ? "combobox" : "color-picker",
        getParamDisplayName: (paramId: string) =>
          (
            ({
              "pinned-group": "Pinned Group",
              "pinned-value": "Pinned Value",
              "unpinned-group": "Unpinned Group",
              "unpinned-value": "Unpinned Value",
            }) as Record<string, string>
          )[paramId] ?? paramId,
        handleColumnResizeStart: vi.fn(),
        hideUnpinnedParams: false,
        inputPorts: [{ id: "input-a", label: "Input A" }],
        isSelectingParams: false,
        outputPorts: [{ id: "output-a", label: "Output A" }],
        paramFilter: "",
        pinned: {
          requiredParamIdsToPaths: {
            "pinned-value": ["pinned-group", "pinned-value"],
          },
          topLevelParamIds: ["pinned-group"],
        },
        positionAndSizeLocked: false,
        sectionId: "section-1",
        sectionTypeName: SectionTypeEnum.Dict,
        selectedParamIds: [],
        styleColor: null,
        unpinned: {
          canEditLayout: true,
          configuredMinHeight: 80,
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
      },
    });
    const constrainedLayout = buildLiveDictAreaPixiLayout({
      liveDictAreaSceneBoundary:
        liveDictAreaMountBoundary.liveDictAreaSceneBoundary,
      maxCanvasHeight: 120,
      width: 320,
    });

    const targets = buildLiveDictAreaPixiValueRowTargets({
      layout: constrainedLayout,
      liveDictAreaMountProps: liveDictAreaMountBoundary.liveDictAreaMountProps,
      liveDictAreaSceneBoundary:
        liveDictAreaMountBoundary.liveDictAreaSceneBoundary,
    });

    expect(targets.map((target) => target.rowId)).toEqual(["pinned-value"]);
  });
});

describe("getLiveDictAreaPixiValueRowHandoffAriaLabel", () => {
  it("uses baseline-like row/value text instead of overlay activation prose", () => {
    expect(
      getLiveDictAreaPixiValueRowHandoffAriaLabel({
        label: "Grid Pattern",
        valueText: "dot",
      }),
    ).toBe('Grid Pattern "dot"');
    expect(
      getLiveDictAreaPixiValueRowHandoffAriaLabel({
        label: "Password Param",
        valueText: null,
      }),
    ).toBe("Password Param");
  });
});
