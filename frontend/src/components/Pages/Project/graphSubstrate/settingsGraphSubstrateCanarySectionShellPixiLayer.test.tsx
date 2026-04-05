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
  };
};

const hoisted = vi.hoisted(() => ({
  appInstances: [] as Array<MockApplicationInstance>,
  graphicsInstances: [] as Array<MockGraphicsInstance>,
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

  it("redraws the Pixi shell layer when drawable output changes", async () => {
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
      viewport: { x: 24, y: -20, zoom: 1 },
    });

    await vi.waitFor(() => {
      expect(hoisted.appInstances[0]?.render).toHaveBeenCalledTimes(2);
    });
  });

  async function renderLayer({
    hoveredSectionId = null,
    sceneSections,
    viewport,
  }: {
    hoveredSectionId?: string | null;
    sceneSections: Array<SettingsGraphSubstrateCanarySceneSection>;
    viewport: { x: number; y: number; zoom: number } | null;
  }) {
    await act(async () => {
      root.render(
        <SettingsGraphSubstrateCanarySectionShellPixiLayer
          draggingSectionId={null}
          hoveredSectionId={hoveredSectionId}
          sceneSections={sceneSections}
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
