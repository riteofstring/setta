import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResponsiveMiniMap } from "./ResponsiveMiniMap";

let mockMinimapSide: "left" | "right" = "left";
let mockOverviewWidth = 0;
let mockUiEditorWidth = 0;

vi.mock("gpuFlow/viewportActions", () => ({
  setCenter: vi.fn(),
}));

vi.mock("gpuFlow/GpuMiniMap", () => ({
  default: ({
    position,
    style,
  }: {
    position: string;
    style?: { transform?: string };
  }) =>
    createElement("div", {
      "data-testid": "responsive-mini-map",
      "data-position": position,
      "data-transform": style?.transform ?? "",
    }),
}));

vi.mock("state/definitions", () => ({
  useLocalStorage: (
    selector: (state: {
      overviewTrueWidth: number;
      uiEditorTrueWidth: number;
      darkMode: boolean;
      minimapSide: "left" | "right";
    }) => unknown,
  ) =>
    selector({
      overviewTrueWidth: mockOverviewWidth,
      uiEditorTrueWidth: mockUiEditorWidth,
      darkMode: false,
      minimapSide: mockMinimapSide,
    }),
}));

describe("ResponsiveMiniMap", () => {
  beforeEach(() => {
    mockMinimapSide = "left";
    mockOverviewWidth = 0;
    mockUiEditorWidth = 0;
  });

  it("offsets the rendered minimap from the overview pane when docked on the left", () => {
    mockOverviewWidth = 320;
    mockUiEditorWidth = 280;

    const markup = renderToStaticMarkup(createElement(ResponsiveMiniMap));

    expect(markup).toContain('data-position="bottom-left"');
    expect(markup).toContain('data-transform="translateX(320px)"');
  });

  it("offsets the rendered minimap from the ui editor when docked on the right", () => {
    mockMinimapSide = "right";
    mockOverviewWidth = 320;
    mockUiEditorWidth = 280;

    const markup = renderToStaticMarkup(createElement(ResponsiveMiniMap));

    expect(markup).toContain('data-position="bottom-right"');
    expect(markup).toContain('data-transform="translateX(-280px)"');
  });
});
