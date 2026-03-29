import { SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it, vi } from "vitest";
import { buildLiveDictAreaMountBoundary } from "./groupContainerLiveDictAreaMountBoundary";
import { buildLiveDictAreaPixiDragRowTargets } from "./liveDictAreaPixiDragRowTargets";

describe("buildLiveDictAreaPixiDragRowTargets", () => {
  it("builds activatable drag targets for every non-placeholder Pixi row", () => {
    const liveDictAreaMountBoundary = buildLiveDictAreaMountBoundary({
      input: {
        bgColor: "bg-transparent",
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
        handleColumnResizeStart: vi.fn(),
        hideUnpinnedParams: false,
        inputPorts: [{ id: "input-a", label: "Input A" }],
        isSelectingParams: true,
        outputPorts: [{ id: "output-a", label: "Output A" }],
        paramFilter: "",
        pinned: {
          requiredParamIdsToPaths: {
            "pinned-group": ["pinned-group"],
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
            "pinned-group": ["pinned-group"],
            "pinned-value": ["pinned-group", "pinned-value"],
          },
          pinnedTopLevelParamIds: ["pinned-group"],
          positionAndSizeLocked: false,
          requiredParamIdsToPaths: {
            "unpinned-group": ["unpinned-group"],
            "unpinned-value": ["unpinned-group", "unpinned-value"],
          },
          topLevelParamIds: ["unpinned-group"],
        },
      },
    });

    const targets = buildLiveDictAreaPixiDragRowTargets({
      liveDictAreaMountProps: liveDictAreaMountBoundary.liveDictAreaMountProps,
      liveDictAreaSceneBoundary:
        liveDictAreaMountBoundary.liveDictAreaSceneBoundary,
    });

    expect(targets.map((target) => target.rowId)).toEqual([
      "pinned-group",
      "pinned-value",
      "unpinned-group",
      "unpinned-value",
    ]);
    expect(targets.map((target) => target.blockId)).toEqual([
      "pinned",
      "pinned",
      "unpinned",
      "unpinned",
    ]);
    expect(targets[0]?.label).toBe("Pinned Group");
    expect(targets[1]?.label).toBe("Pinned Value");
    expect(targets[0]?.blockY).toBeLessThan(targets[2]?.blockY ?? 0);
    expect(targets[0]?.y).toBeLessThan(targets[1]?.y ?? 0);
    expect(targets[0]?.blockHeight).toBeGreaterThan(targets[0]?.height ?? 0);
  });
});
