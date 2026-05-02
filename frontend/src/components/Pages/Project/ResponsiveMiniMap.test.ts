import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getZoom, setCenter } from "gpuFlow/viewportActions";
import { ResponsiveMiniMap } from "./ResponsiveMiniMap";

let mockMinimapSide: "left" | "right" = "left";
let mockOverviewWidth = 0;
let mockUiEditorWidth = 0;
let mockZoom = 1;
let mockMiniMapClick:
  | { readonly position: { readonly x: number; readonly y: number } }
  | null = null;

vi.mock("gpuFlow/viewportActions", () => ({
  getZoom: vi.fn(() => mockZoom),
  setCenter: vi.fn(),
}));

vi.mock("gpuFlow/GpuMiniMap", () => ({
  default: ({
    onClick,
    position,
    style,
  }: {
    onClick?: (
      event: unknown,
      position: { readonly x: number; readonly y: number },
    ) => void;
    position: string;
    style?: { transform?: string };
  }) => {
    if (mockMiniMapClick) {
      onClick?.({}, mockMiniMapClick.position);
    }
    return createElement("div", {
      "data-testid": "responsive-mini-map",
      "data-position": position,
      "data-transform": style?.transform ?? "",
    });
  },
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
    mockZoom = 1;
    mockMiniMapClick = null;
    vi.mocked(getZoom).mockClear();
    vi.mocked(setCenter).mockClear();
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

  it("recenters minimap clicks without changing the current GPU zoom", () => {
    mockOverviewWidth = 320;
    mockZoom = 0.75;
    mockMiniMapClick = { position: { x: 120, y: 240 } };

    renderToStaticMarkup(createElement(ResponsiveMiniMap));

    expect(getZoom).toHaveBeenCalledTimes(1);
    expect(setCenter).toHaveBeenCalledWith(120, 240, {
      overviewWidth: 320,
      zoom: 0.75,
    });
  });
});
