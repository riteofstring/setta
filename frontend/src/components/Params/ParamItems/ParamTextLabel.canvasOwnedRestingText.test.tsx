import {
  CANVAS_OWNED_SECTION_SHELL_ID,
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

  it("keeps non-canary or legacy param labels visible", () => {
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

    const nonCanaryMarkup = renderToStaticMarkup(
      <ParamTextLabel
        bg="bg-white"
        paramInfoId={PARAM_INFO_ID}
        sectionId="settings-section__dictSectionDefault"
      />,
    );

    expect(nonCanaryMarkup).not.toContain(
      'data-canvas-owned-resting-text="true"',
    );
    expect(nonCanaryMarkup).not.toContain("opacity-0");
  });
});
