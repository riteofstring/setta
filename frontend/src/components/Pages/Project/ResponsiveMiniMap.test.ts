import { getZoom, setCenter } from "gpuFlow/viewportActions";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResponsiveMiniMap } from "./ResponsiveMiniMap";

let mockMinimapSide: "left" | "right" = "left";
let mockOverviewWidth = 0;
let mockUiEditorWidth = 0;
let mockZoom = 1;
let mockDarkMode = false;
let mockActiveIds: readonly string[] = [];
let mockTemporaryMiscState: Record<string, unknown> = {};
let mockProjectState: MockProjectState = createMockProjectState();
let mockEffectiveImplBySectionId: Record<
  string,
  { readonly styleColor?: string | null; readonly type: string }
> = {};
let mockMiniMapClick: {
  readonly position: { readonly x: number; readonly y: number };
} | null = null;
let lastMiniMapProps: MockGpuMiniMapProps | null = null;

type MockGpuMiniMapProps = {
  readonly nodeVisuals?: readonly unknown[] | undefined;
  readonly onClick?: (
    event: unknown,
    position: { readonly x: number; readonly y: number },
  ) => void;
  readonly position: string;
  readonly selectedNodeIds?: readonly string[] | undefined;
  readonly style?: { transform?: string };
};

type MockProjectState = {
  readonly parentSectionMap: Record<string, string | null | undefined>;
  readonly projectConfig: {
    readonly sectionVariantMap: Record<string, string>;
  };
  readonly sectionImpls: Record<string, unknown>;
  readonly sections: Record<string, unknown>;
  readonly sectionVariants: Record<string, { readonly impl: string }>;
};

vi.mock("gpuFlow/viewportActions", () => ({
  getZoom: vi.fn(() => mockZoom),
  setCenter: vi.fn(),
}));

vi.mock("./GpuProjectSurface/projectGpuLayoutAdapter", () => ({
  useProjectGpuLayoutStore: () => ({}),
}));

vi.mock("state/actions/sectionInfos", () => ({
  getCurrEffectiveSectionImpl: (_state: unknown, sectionId: string) => {
    const impl = mockEffectiveImplBySectionId[sectionId];
    if (!impl) {
      throw new Error(`Missing mock effective impl for ${sectionId}.`);
    }
    return impl;
  },
}));

vi.mock("utils/sectionStyleColors", () => ({
  deriveSectionStyleTheme: (styleColor: string, darkMode: boolean) => ({
    bg: darkMode ? `${styleColor}-dark` : `${styleColor}-light`,
  }),
}));

vi.mock("gpuFlow/GpuMiniMap", () => ({
  default: (props: MockGpuMiniMapProps) => {
    lastMiniMapProps = props;
    if (mockMiniMapClick) {
      props.onClick?.({}, mockMiniMapClick.position);
    }
    return createElement("div", {
      "data-testid": "responsive-mini-map",
      "data-position": props.position,
      "data-transform": props.style?.transform ?? "",
    });
  },
}));

vi.mock("state/definitions", () => ({
  useActiveSectionUI: (
    selector: (state: { activeIds: readonly string[] }) => unknown,
  ) => selector({ activeIds: mockActiveIds }),
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
      darkMode: mockDarkMode,
      minimapSide: mockMinimapSide,
    }),
  useProjectState: (selector: (state: MockProjectState) => unknown) =>
    selector(mockProjectState),
  useTemporaryMiscState: (
    selector: (state: Record<string, unknown>) => unknown,
  ) => selector(mockTemporaryMiscState),
}));

describe("ResponsiveMiniMap", () => {
  beforeEach(() => {
    mockMinimapSide = "left";
    mockOverviewWidth = 0;
    mockUiEditorWidth = 0;
    mockZoom = 1;
    mockDarkMode = false;
    mockActiveIds = [];
    mockTemporaryMiscState = {};
    mockProjectState = createMockProjectState();
    mockEffectiveImplBySectionId = {};
    mockMiniMapClick = null;
    lastMiniMapProps = null;
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

  it("passes project-owned selection and section visuals into the generic minimap", () => {
    mockActiveIds = ["section-a"];
    mockProjectState = {
      ...createMockProjectState(),
      parentSectionMap: {
        "nested-section": "section-a",
      },
      projectConfig: {
        sectionVariantMap: {
          "missing-section": "variant-missing",
          "nested-section": "variant-nested",
          "section-a": "variant-a",
        },
      },
      sectionImpls: {
        "impl-a": {},
        "impl-nested": {},
      },
      sections: {
        "nested-section": {},
        "section-a": {},
      },
      sectionVariants: {
        "variant-a": { impl: "impl-a" },
        "variant-nested": { impl: "impl-nested" },
      },
    };
    mockTemporaryMiscState = {
      "section-style-preview-color-section-a": "preview-blue",
    };
    mockEffectiveImplBySectionId = {
      "section-a": { styleColor: "durable-green", type: "custom-section" },
    };

    renderToStaticMarkup(createElement(ResponsiveMiniMap));

    expect(lastMiniMapProps?.selectedNodeIds).toEqual(["section-a"]);
    expect(lastMiniMapProps?.nodeVisuals).toEqual([
      {
        id: "section-a",
        style: { background: "preview-blue-light" },
        type: "custom-section",
      },
    ]);
  });
});

function createMockProjectState() {
  return {
    parentSectionMap: {},
    projectConfig: {
      sectionVariantMap: {},
    },
    sectionImpls: {},
    sections: {},
    sectionVariants: {},
  };
}
