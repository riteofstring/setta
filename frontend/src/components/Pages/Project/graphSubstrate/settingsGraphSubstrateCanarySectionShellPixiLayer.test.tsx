/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { SectionTypeEnum } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SettingsGraphSubstrateCanarySceneSection } from "./settingsGraphSubstrateCanarySceneSnapshot";
import { SettingsGraphSubstrateCanarySectionShellPixiLayer } from "./settingsGraphSubstrateCanarySectionShellPixiLayer";

type MockGraphicsInstance = {
  clear: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  eventMode: string;
  fill: ReturnType<typeof vi.fn>;
  roundRect: ReturnType<typeof vi.fn>;
  stroke: ReturnType<typeof vi.fn>;
};

type MockApplicationInstance = {
  destroy: ReturnType<typeof vi.fn>;
  init: ReturnType<typeof vi.fn>;
  render: ReturnType<typeof vi.fn>;
  renderer: {
    height: number;
    resize: ReturnType<typeof vi.fn>;
    width: number;
  };
  stage: {
    addChild: ReturnType<typeof vi.fn>;
    eventMode: string;
    position: {
      set: ReturnType<typeof vi.fn>;
    };
    scale: {
      set: ReturnType<typeof vi.fn>;
    };
  };
};

const hoisted = vi.hoisted(() => ({
  appInstances: [] as Array<MockApplicationInstance>,
  graphicsInstances: [] as Array<MockGraphicsInstance>,
  measureMotionAttribution: vi.fn((_owner: string, fn: () => unknown) => fn()),
  updateInstrumentationSnapshot: vi.fn(),
}));

vi.mock("state/activeSectionUI", () => ({
  useActiveSectionUI: vi.fn(() => []),
}));

vi.mock("state/definitions", () => ({
  useLocalStorage: vi.fn(
    (selector: (state: { darkMode: boolean }) => unknown) =>
      selector({ darkMode: false }),
  ),
  useTemporaryMiscState: vi.fn(
    (
      selector: (
        state: Record<string, string | null | undefined>,
      ) => Record<string, string | null | undefined>,
    ) => selector({}),
  ),
}));

vi.mock("./settingsGraphSubstrateCanarySceneStore", () => ({
  useSettingsGraphSubstrateCanarySceneStore: vi.fn(
    (
      selector: (state: { sectionSeedNodes: Map<string, unknown> }) => unknown,
    ) => selector({ sectionSeedNodes: new Map() }),
  ),
}));

vi.mock("./settingsGraphSubstrateCanaryInstrumentation", () => ({
  measureSettingsGraphSubstrateCanaryMotionAttribution:
    hoisted.measureMotionAttribution,
  updateSettingsGraphSubstrateCanaryInstrumentationSnapshot:
    hoisted.updateInstrumentationSnapshot,
}));

vi.mock("pixi.js", () => {
  class GraphicsMock {
    clear = vi.fn(() => this);
    destroy = vi.fn();
    eventMode = "auto";
    fill = vi.fn(() => this);
    roundRect = vi.fn(() => this);
    stroke = vi.fn(() => this);

    constructor() {
      hoisted.graphicsInstances.push(this);
    }
  }

  class ApplicationMock {
    destroy = vi.fn();
    init = vi.fn(async () => {});
    render = vi.fn();
    renderer = {
      height: 0,
      resize: vi.fn((width: number, height: number) => {
        this.renderer.width = width;
        this.renderer.height = height;
      }),
      width: 0,
    };
    stage = {
      addChild: vi.fn(),
      eventMode: "auto",
      position: {
        set: vi.fn(),
      },
      scale: {
        set: vi.fn(),
      },
    };

    constructor() {
      hoisted.appInstances.push(this);
    }
  }

  return {
    Application: ApplicationMock,
    Graphics: GraphicsMock,
  };
});

describe("SettingsGraphSubstrateCanarySectionShellPixiLayer", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    hoisted.appInstances.length = 0;
    hoisted.graphicsInstances.length = 0;
    hoisted.measureMotionAttribution.mockClear();
    hoisted.updateInstrumentationSnapshot.mockReset();
    host = document.createElement("div");
    Object.defineProperty(host, "clientWidth", {
      configurable: true,
      value: 720,
    });
    Object.defineProperty(host, "clientHeight", {
      configurable: true,
      value: 480,
    });
    document.body.appendChild(host);
    root = createRoot(host);
    vi.stubGlobal(
      "ResizeObserver",
      class ResizeObserverMock {
        constructor(_callback: ResizeObserverCallback) {}
        disconnect() {}
        observe(_target: Element) {}
      },
    );
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  it("does not redraw the full Pixi shell layer for semantically identical rerenders", async () => {
    await renderLayer({
      sceneSections: [createSceneSection()],
      viewport: { x: 10, y: -20, zoom: 1 },
    });

    await vi.waitFor(() => {
      expect(hoisted.appInstances).toHaveLength(1);
      expect(hoisted.appInstances[0]?.render).toHaveBeenCalledTimes(1);
    });

    await renderLayer({
      sceneSections: [createSceneSection()],
      viewport: { x: 10, y: -20, zoom: 1 },
    });

    await vi.waitFor(() => {
      expect(hoisted.appInstances[0]?.render).toHaveBeenCalledTimes(1);
    });
  });

  it("reuses the existing Pixi geometry when only the viewport changes", async () => {
    await renderLayer({
      sceneSections: [createSceneSection()],
      viewport: { x: 10, y: -20, zoom: 1 },
    });

    await vi.waitFor(() => {
      expect(hoisted.appInstances).toHaveLength(1);
      expect(hoisted.appInstances[0]?.render).toHaveBeenCalledTimes(1);
      expect(hoisted.graphicsInstances[0]?.clear).toHaveBeenCalledTimes(1);
    });

    await renderLayer({
      sceneSections: [createSceneSection()],
      viewport: { x: 24, y: -20, zoom: 1.2 },
    });

    await vi.waitFor(() => {
      expect(hoisted.appInstances[0]?.render).toHaveBeenCalledTimes(2);
      expect(hoisted.graphicsInstances[0]?.clear).toHaveBeenCalledTimes(1);
      expect(
        hoisted.appInstances[0]?.stage.position.set,
      ).toHaveBeenLastCalledWith(24, -20);
      expect(hoisted.appInstances[0]?.stage.scale.set).toHaveBeenLastCalledWith(
        1.2,
      );
      expect(hoisted.measureMotionAttribution).toHaveBeenCalledWith(
        "pixiViewportPresent",
        expect.any(Function),
      );
    });
  });

  it("redraws the Pixi shell layer when drawable output changes", async () => {
    await renderLayer({
      sceneSections: [createSceneSection()],
      viewport: { x: 10, y: -20, zoom: 1 },
    });

    await vi.waitFor(() => {
      expect(hoisted.appInstances).toHaveLength(1);
      expect(hoisted.appInstances[0]?.render).toHaveBeenCalledTimes(1);
      expect(hoisted.graphicsInstances[0]?.clear).toHaveBeenCalledTimes(1);
    });

    await renderLayer({
      sceneSections: [createSceneSection({ styleColor: "#22c55e" })],
      viewport: { x: 10, y: -20, zoom: 1 },
    });

    await vi.waitFor(() => {
      expect(hoisted.appInstances[0]?.render).toHaveBeenCalledTimes(2);
      expect(hoisted.graphicsInstances[0]?.clear).toHaveBeenCalledTimes(2);
    });
  });

  it("skips offscreen inactive section drawables on the focused viewport", async () => {
    await renderLayer({
      sceneSections: [
        createSceneSection({ sectionId: "visible-section" }),
        createSceneSection({
          position: { x: 1280, y: 80 },
          renderedPosition: { x: 1280, y: 80 },
          sectionId: "offscreen-section",
        }),
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
    });

    await vi.waitFor(() => {
      expect(hoisted.appInstances).toHaveLength(1);
      expect(hoisted.updateInstrumentationSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          pixiDrawableCount: 1,
        }),
      );
      expect(hoisted.graphicsInstances[0]?.clear).toHaveBeenCalledTimes(1);
    });
  });

  it("keeps active offscreen section drawables mounted", async () => {
    await renderLayer({
      sceneSections: [
        createSceneSection({ sectionId: "visible-section" }),
        createSceneSection({
          isActiveSection: true,
          position: { x: 1280, y: 80 },
          renderedPosition: { x: 1280, y: 80 },
          sectionId: "active-offscreen-section",
        }),
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
    });

    await vi.waitFor(() => {
      expect(hoisted.appInstances).toHaveLength(1);
      expect(hoisted.updateInstrumentationSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          pixiDrawableCount: 2,
        }),
      );
      expect(hoisted.graphicsInstances[0]?.clear).toHaveBeenCalledTimes(1);
    });
  });

  async function renderLayer({
    hoveredSectionId = null,
    sceneSections,
    visibleViewportRect = { x: 0, y: 0, width: 720, height: 480 },
    viewport,
  }: {
    hoveredSectionId?: string | null;
    sceneSections: Array<SettingsGraphSubstrateCanarySceneSection>;
    visibleViewportRect?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    viewport: { x: number; y: number; zoom: number } | null;
  }) {
    await act(async () => {
      root.render(
        <SettingsGraphSubstrateCanarySectionShellPixiLayer
          draggingSectionId={null}
          hoveredSectionId={hoveredSectionId}
          sceneSections={sceneSections}
          visibleViewportRect={visibleViewportRect}
          viewport={viewport}
        />,
      );
    });
  }
});

function createSceneSection(
  overrides: Partial<SettingsGraphSubstrateCanarySceneSection> = {},
): SettingsGraphSubstrateCanarySceneSection {
  return {
    height: 160,
    isActiveSection: false,
    isInOtherProjectConfigs: false,
    position: { x: 120, y: 80 },
    positionAndSizeLocked: false,
    renderedPosition: { x: 120, y: 80 },
    sceneBoundsSize: { width: 240, height: 160 },
    sectionId: "section-a",
    sectionTypeName: SectionTypeEnum.Code,
    styleColor: null,
    tempZIndex: 2,
    textBlockMetaControlStyle: false,
    width: 240,
    zIndex: 2,
    ...overrides,
  };
}
