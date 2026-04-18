import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  graphSurfaceImplementation: "legacy-dom" as
    | "canvas-shell-underlay"
    | "legacy-dom",
  lightweightNestedChildrenSectionId: null as string | null,
}));

vi.mock("components/Utils/FloatingBox", () => ({
  getFloatingBoxHandlers: () => ({}),
}));

vi.mock("components/Params/GetParamSwitch", () => ({
  GetParamSwitch: () => (
    <>
      <article data-param-row="true" data-testid="nested-child-row-1" />
      <article data-param-row="true" data-testid="nested-child-row-2" />
    </>
  ),
}));

vi.mock("./ParamItems/ParamInput", () => ({
  ParamInput: () => <div data-testid="param-input" />,
}));

vi.mock("./ResizeHandle", () => ({
  ResizeHandle: () => <div data-testid="resize-handle" />,
}));

vi.mock("forks/xyflow/core/container/graphSurfaceImplementation", () => ({
  useGraphSurfaceImplementation: () => mocks.graphSurfaceImplementation,
}));

vi.mock("forks/xyflow/core/container/sectionShellCanvasOwnership", () => ({
  isCanvasOwnedSectionLightweightNestedChildren: (
    candidateSectionId: string,
  ) => candidateSectionId === mocks.lightweightNestedChildrenSectionId,
  isCanvasOwnedSectionLightweightParamLabel: () => false,
  isCanvasOwnedSectionLightweightResizeHandle: () => false,
  isCanvasOwnedSectionNestedGuide: (candidateSectionId: string) =>
    candidateSectionId === mocks.lightweightNestedChildrenSectionId,
}));

vi.mock("state/actions/sectionInfos", () => ({
  getCurrEffectiveCodeObjImplIfPresent: () => ({
    description: "Current param",
  }),
}));

vi.mock("state/definitions", () => ({
  useProjectState: (selector: (state: object) => unknown) =>
    selector({
      codeObjs: {
        "param-current": {
          displayName: "Current Param",
          name: "currentParam",
        },
      },
      projectConfig: {
        showParamDisplayNames: false,
      },
    }),
}));

vi.mock("./ParamDndContext", () => ({
  useParamDndChildrenForParent: () => ["param-child"],
}));

import { ParamContainer } from "./ParamContainer";

describe("ParamContainer lightweight nested children", () => {
  it("removes the extra nested-child wrapper on the active canvas lane", () => {
    mocks.graphSurfaceImplementation = "canvas-shell-underlay";
    mocks.lightweightNestedChildrenSectionId = "section-sizing-policy";

    const markup = renderToStaticMarkup(
      <ParamContainer
        sectionId="section-sizing-policy"
        paramInfoId="param-current"
        requiredParamIdsToPaths={{}}
        onResizeStart={() => undefined}
        listKey="unpinned"
        isKwarg={false}
        isNestedParam={false}
        hasSectionStyleTheme={false}
        paramChildren={["param-child"]}
        border=""
        bg=""
      >
        <span data-testid="param-label">Param</span>
      </ParamContainer>,
    );

    expect(markup).not.toContain(
      'class="section-args-nested section-key-value relative grid',
    );
    expect(markup).toContain('data-canvas-owned-nested-guide="true"');
    expect(markup).toContain(
      'data-canvas-owned-nested-guide-lightweight="true"',
    );
    expect(markup).toContain('data-testid="nested-child-row-1"');
    expect(markup).toContain('data-testid="nested-child-row-2"');
  });
});
