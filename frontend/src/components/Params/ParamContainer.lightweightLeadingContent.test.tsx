import type { CSSProperties } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  graphSurfaceImplementation: "legacy-dom" as
    | "canvas-shell-underlay"
    | "legacy-dom",
  lightweightParamLabelSectionId: null as string | null,
}));

vi.mock("components/Utils/FloatingBox", () => ({
  getFloatingBoxHandlers: () => ({}),
}));

vi.mock("components/Params/GetParamSwitch", () => ({
  GetParamSwitch: () => null,
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
  isCanvasOwnedSectionLightweightParamLabel: (candidateSectionId: string) =>
    candidateSectionId === mocks.lightweightParamLabelSectionId,
  isCanvasOwnedSectionLightweightResizeHandle: () => false,
  isCanvasOwnedSectionShell: () => false,
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
  useParamDndChildrenForParent: () => [],
}));

import { ParamContainer } from "./ParamContainer";

describe("ParamContainer lightweight leading content", () => {
  it("uses the param label element itself as the key column root on the active canvas lane", () => {
    mocks.graphSurfaceImplementation = "canvas-shell-underlay";
    mocks.lightweightParamLabelSectionId = "section-sizing-policy";

    function LightweightLabel(props: {
      className?: string;
      lightweightCanvasRoot?: boolean;
      style?: CSSProperties;
    }) {
      const { className, lightweightCanvasRoot, style } = props;
      return (
        <p
          className={className}
          data-lightweight-canvas-root={
            lightweightCanvasRoot ? "true" : undefined
          }
          data-testid="lightweight-label"
          style={style}
        >
          Param
        </p>
      );
    }

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
        paramChildren={[]}
        border=""
        bg=""
      >
        <LightweightLabel />
      </ParamContainer>,
    );

    expect(markup).not.toContain("<div class=\"section-key overflow-hidden\"");
    expect(markup).toContain("data-lightweight-canvas-root=\"true\"");
    expect(markup).toContain("class=\"section-key overflow-hidden\"");
    expect(markup).toContain(
      'style="width:var(--param-column-width, 200px)"',
    );
  });
});
