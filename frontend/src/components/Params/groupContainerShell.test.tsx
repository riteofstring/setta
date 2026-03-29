import { renderToStaticMarkup } from "react-dom/server";
import { SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it, vi } from "vitest";
import { buildLiveDictAreaMountBoundary } from "./groupContainerLiveDictAreaMountBoundary";
import { GroupContainerShell } from "./groupContainerShell";

vi.mock(import("state/definitions"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useProjectState: (selector: (state: object) => unknown) => selector({}),
  };
});

vi.mock("state/actions/sectionInfos", () => ({
  getCurrEffectiveCodeObjImpl: (
    _state: object,
    _sectionId: string,
    rowId: string,
  ) => ({
    type: rowId === "pinned-value" ? "DropdownParam" : "TextParam",
  }),
}));

describe("GroupContainerShell", () => {
  it("can swap the live dict-area shell over to the Pixi canary scene mount", () => {
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

    const markup = renderToStaticMarkup(
      <GroupContainerShell
        liveDictAreaMountProps={
          liveDictAreaMountBoundary.liveDictAreaMountProps
        }
        liveDictAreaSceneBoundary={
          liveDictAreaMountBoundary.liveDictAreaSceneBoundary
        }
        renderMode="pixi-node-body"
        setOuterRef={() => {}}
        waitingForResult={false}
      />,
    );

    expect(markup).toContain(
      'data-live-dict-area-render-mode="pixi-node-body"',
    );
    expect(markup).toContain('data-live-dict-area-scene="pixi"');
    expect(markup).toContain('data-live-dict-area-editor-handoff="value-row"');
    expect(markup).toContain(
      'data-live-dict-area-editor-handoff-editor-kind="combobox"',
    );
    expect(markup).toContain('data-live-dict-area-fixed-measurement="edges"');
    expect(markup).toContain('data-live-dict-area-fixed-measurement="pinned"');
    expect(markup).not.toContain(
      'data-live-dict-area-fixed-measurement="unpinned"',
    );
    expect(markup).not.toContain("data-dict-area-block-frame-id=");
    expect(markup).not.toContain(
      'data-live-dict-area-editor-handoff="available"',
    );
  });
});
