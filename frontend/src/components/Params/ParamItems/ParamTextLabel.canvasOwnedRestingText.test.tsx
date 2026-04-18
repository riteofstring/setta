import {
  CANVAS_OWNED_SECTION_SHELL_ID,
  DICT_CANVAS_OWNED_SECTION_SHELL_ID,
  GLOBAL_VARIABLES_CANVAS_OWNED_SECTION_SHELL_ID,
  SECTION_SIZING_POLICY_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
} from "forks/xyflow/core/container/sectionShellCanvasOwnership";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const PARAM_INFO_ID =
  "settings-codeobj__callableSectionDefault__callableSectionDefault__styleColor";

const mocks = vi.hoisted(() => ({
  graphSurfaceImplementation: "legacy-dom" as
    | "canvas-shell-underlay"
    | "legacy-dom",
}));

vi.mock("state/actions/sectionInfos", () => ({
  getParamDisplayNameIfPresent: (
    _state: unknown,
    _sectionId: string,
    paramInfoId: string,
  ) => (paramInfoId === PARAM_INFO_ID ? "Style Color" : null),
}));

vi.mock("state/definitions", () => ({
  useMisc: Object.assign(() => undefined, {
    getState: () => ({
      isSelectingParams: false,
    }),
  }),
  useProjectState: (selector: (state: object) => unknown) => selector({}),
}));

vi.mock("forks/xyflow/core/container/graphSurfaceImplementation", () => ({
  useGraphSurfaceImplementation: () => mocks.graphSurfaceImplementation,
}));

import { ParamTextLabel } from "./ParamTextLabel";

describe("ParamTextLabel canvas-owned resting text", () => {
  it("hides canary param labels on the canvas path", () => {
    mocks.graphSurfaceImplementation = "canvas-shell-underlay";

    const markup = renderToStaticMarkup(
      <ParamTextLabel
        bg="bg-white"
        paramInfoId={PARAM_INFO_ID}
        sectionId={CANVAS_OWNED_SECTION_SHELL_ID}
      />,
    );

    expect(markup).toContain('data-canvas-owned-resting-text="true"');
    expect(markup).toContain("opacity-0");
    expect(markup).toContain("Style Color");
  });

  it("keeps legacy or truly non-owned param labels visible", () => {
    mocks.graphSurfaceImplementation = "legacy-dom";

    const legacyMarkup = renderToStaticMarkup(
      <ParamTextLabel
        bg="bg-white"
        paramInfoId={PARAM_INFO_ID}
        sectionId={CANVAS_OWNED_SECTION_SHELL_ID}
      />,
    );

    expect(legacyMarkup).not.toContain('data-canvas-owned-resting-text="true"');
    expect(legacyMarkup).not.toContain("opacity-0");

    mocks.graphSurfaceImplementation = "canvas-shell-underlay";

    const nonOwnedMarkup = renderToStaticMarkup(
      <ParamTextLabel
        bg="bg-white"
        paramInfoId={PARAM_INFO_ID}
        sectionId="settings-section__textBlockSectionDefault"
      />,
    );

    expect(nonOwnedMarkup).not.toContain(
      'data-canvas-owned-resting-text="true"',
    );
    expect(nonOwnedMarkup).not.toContain("opacity-0");
  });

  it("hides dict canary param labels on the canvas path", () => {
    mocks.graphSurfaceImplementation = "canvas-shell-underlay";

    const markup = renderToStaticMarkup(
      <ParamTextLabel
        bg="bg-white"
        paramInfoId={PARAM_INFO_ID}
        sectionId={DICT_CANVAS_OWNED_SECTION_SHELL_ID}
      />,
    );

    expect(markup).toContain('data-canvas-owned-resting-text="true"');
    expect(markup).toContain("opacity-0");
  });

  it("hides global variables canary param labels on the canvas path", () => {
    mocks.graphSurfaceImplementation = "canvas-shell-underlay";

    const markup = renderToStaticMarkup(
      <ParamTextLabel
        bg="bg-white"
        paramInfoId={PARAM_INFO_ID}
        sectionId={GLOBAL_VARIABLES_CANVAS_OWNED_SECTION_SHELL_ID}
      />,
    );

    expect(markup).toContain('data-canvas-owned-resting-text="true"');
    expect(markup).toContain("opacity-0");
  });

  it("supports the lightweight section sizing policy label root on the canvas path", () => {
    mocks.graphSurfaceImplementation = "canvas-shell-underlay";

    const markup = renderToStaticMarkup(
      <ParamTextLabel
        bg="bg-white"
        className="section-key overflow-hidden"
        lightweightCanvasRoot
        paramInfoId={PARAM_INFO_ID}
        sectionId={SECTION_SIZING_POLICY_CANVAS_OWNED_RESTING_TEXT_SECTION_ID}
        style={{ width: "200px" }}
      />,
    );

    expect(markup).toContain('data-canvas-owned-resting-text="true"');
    expect(markup).toContain(
      'data-canvas-owned-param-label-lightweight="true"',
    );
    expect(markup).toContain("section-key overflow-hidden");
    expect(markup).toContain('style="width:200px"');
  });
});
