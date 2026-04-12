/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsGraphSubstrateCanary } from "./SettingsGraphSubstrateCanary";
import {
  readSettingsGraphSubstrateCanaryInstrumentationSnapshot,
  resetSettingsGraphSubstrateCanaryInstrumentationSnapshot,
  updateSettingsGraphSubstrateCanaryInstrumentationSnapshot,
} from "./settingsGraphSubstrateCanaryInstrumentation";

const hoisted = vi.hoisted(() => ({
  controller: {
    draggingSectionId: null,
    finishPanePan: vi.fn(),
    handlePaneClick: vi.fn(),
    handlePanePointerDown: vi.fn(),
    handlePanePointerMove: vi.fn(),
    handlePaneWheel: vi.fn(),
    resolvedViewport: { x: 120, y: -80, zoom: 1.25 },
    rootCursor: "grab",
    rootRef: { current: null as HTMLDivElement | null },
    sceneSections: [{ sectionId: "section-a" }],
    sectionDragController: {
      cancelSectionDrag: vi.fn(),
      cleanup: vi.fn(),
      finishSectionDrag: vi.fn(),
      handleSectionPointerDown: vi.fn(),
      handleSectionPointerMove: vi.fn(),
    },
    shouldShowGridLines: true,
    visibleViewportRect: { x: 0, y: 0, width: 720, height: 480 },
    viewportTransform: "translate3d(120px, -80px, 0) scale(1.25)",
  },
}));

vi.mock("./settingsGraphSubstrateCanaryController", () => ({
  useSettingsGraphSubstrateCanaryController: vi.fn(() => hoisted.controller),
}));

vi.mock("./settingsGraphSubstrateCanaryBackground", () => ({
  SettingsGraphSubstrateCanaryBackground: vi.fn(
    ({ viewport }: { viewport: unknown }) => (
      <div
        data-testid="graph-substrate-canary-background"
        data-viewport={JSON.stringify(viewport)}
      />
    ),
  ),
}));

vi.mock("./settingsGraphSubstrateCanarySectionsLayer", () => ({
  SettingsGraphSubstrateCanarySectionsLayer: vi.fn(
    ({
      mountedSectionBodyIds,
      presentedSceneSections,
      sceneSections,
    }: {
      mountedSectionBodyIds?: ReadonlySet<string>;
      presentedSceneSections?: Array<{ sectionId: string }>;
      sceneSections: Array<{ sectionId: string }>;
    }) => (
      <div
        data-mounted-body-count={String(mountedSectionBodyIds?.size ?? 0)}
        data-testid="graph-substrate-canary-sections-layer"
        data-count={String((presentedSceneSections ?? sceneSections).length)}
      />
    ),
  ),
}));

vi.mock("./settingsGraphSubstrateCanarySectionShellPixiLayer", () => ({
  SettingsGraphSubstrateCanarySectionShellPixiLayer: vi.fn(
    ({
      presentedSceneSections,
      sceneSections,
      viewport,
    }: {
      presentedSceneSections?: Array<{ sectionId: string }>;
      sceneSections: Array<{ sectionId: string }>;
      viewport: unknown;
    }) => (
      <div
        data-testid="graph-substrate-canary-section-pixi-layer"
        data-count={String((presentedSceneSections ?? sceneSections).length)}
        data-viewport={JSON.stringify(viewport)}
      />
    ),
  ),
}));

describe("SettingsGraphSubstrateCanary", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    hoisted.controller.resolvedViewport = { x: 120, y: -80, zoom: 1.25 };
    hoisted.controller.sceneSections = [{ sectionId: "section-a" }];
    hoisted.controller.shouldShowGridLines = true;
    hoisted.controller.visibleViewportRect = {
      x: 0,
      y: 0,
      width: 720,
      height: 480,
    };
    hoisted.controller.viewportTransform =
      "translate3d(120px, -80px, 0) scale(1.25)";

    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    document.body.innerHTML = "";
    resetSettingsGraphSubstrateCanaryInstrumentationSnapshot();
  });

  it("renders the substrate-owned background and sections layer from the controller state", async () => {
    await act(async () => {
      root.render(<SettingsGraphSubstrateCanary />);
    });

    expect(
      host
        .querySelector("[data-testid='graph-substrate-canary-background']")
        ?.getAttribute("data-viewport"),
    ).toBe(JSON.stringify(hoisted.controller.resolvedViewport));
    expect(
      host
        .querySelector("[data-testid='graph-substrate-canary-sections-layer']")
        ?.getAttribute("data-count"),
    ).toBe("1");
    expect(
      host
        .querySelector("[data-testid='graph-substrate-canary-sections-layer']")
        ?.getAttribute("data-mounted-body-count"),
    ).toBe("1");
    expect(
      host
        .querySelector(
          "[data-testid='graph-substrate-canary-section-pixi-layer']",
        )
        ?.getAttribute("data-count"),
    ).toBe("1");
    expect(
      host
        .querySelector(
          "[data-testid='graph-substrate-canary-section-pixi-layer']",
        )
        ?.getAttribute("data-viewport"),
    ).toBe(JSON.stringify(hoisted.controller.resolvedViewport));

    const viewport = host.querySelector(
      "[data-testid='graph-substrate-canary-viewport']",
    );
    expect(viewport?.getAttribute("style")).toContain(
      "translate3d(120px, -80px, 0) scale(1.25)",
    );
    expect(viewport?.getAttribute("style")).toContain("will-change: transform");
    expect(viewport?.getAttribute("style")).toContain(
      "contain: layout paint style",
    );
  });

  it("falls back to the empty-state copy when no sections are visible", async () => {
    hoisted.controller.shouldShowGridLines = false;
    hoisted.controller.sceneSections = [];

    await act(async () => {
      root.render(<SettingsGraphSubstrateCanary />);
    });

    expect(
      host.querySelector("[data-testid='graph-substrate-canary-background']"),
    ).toBeNull();
    expect(
      host.querySelector(
        "[data-testid='graph-substrate-canary-sections-layer']",
      ),
    ).toBeNull();
    expect(
      host.querySelector(
        "[data-testid='graph-substrate-canary-section-pixi-layer']",
      ),
    ).toBeNull();
    expect(host.textContent).toContain(
      "No visible settings sections available for the graph substrate canary.",
    );
  });

  it("shares one presented section subset across the DOM and Pixi renderer layers", async () => {
    hoisted.controller.resolvedViewport = { x: 0, y: 0, zoom: 1 };
    hoisted.controller.sceneSections = [
      {
        renderedPosition: { x: 24, y: 32 },
        sceneBoundsSize: { height: 120, width: 240 },
        sectionId: "visible-section",
      },
      {
        renderedPosition: { x: 1440, y: 32 },
        sceneBoundsSize: { height: 120, width: 240 },
        sectionId: "offscreen-section",
      },
    ];
    hoisted.controller.viewportTransform = "translate3d(0px, 0px, 0) scale(1)";

    await act(async () => {
      root.render(<SettingsGraphSubstrateCanary />);
    });

    expect(
      host
        .querySelector("[data-testid='graph-substrate-canary-sections-layer']")
        ?.getAttribute("data-count"),
    ).toBe("1");
    expect(
      host
        .querySelector("[data-testid='graph-substrate-canary-sections-layer']")
        ?.getAttribute("data-mounted-body-count"),
    ).toBe("1");
    expect(
      host
        .querySelector(
          "[data-testid='graph-substrate-canary-section-pixi-layer']",
        )
        ?.getAttribute("data-count"),
    ).toBe("1");
  });

  it("keeps the profiled sections subtree stable across viewport-only updates", async () => {
    await act(async () => {
      root.render(<SettingsGraphSubstrateCanary />);
    });

    const mockedSectionsLayer = vi.mocked(
      (await import("./settingsGraphSubstrateCanarySectionsLayer"))
        .SettingsGraphSubstrateCanarySectionsLayer,
    );
    const initialSectionsLayerCallCount = mockedSectionsLayer.mock.calls.length;
    expect(initialSectionsLayerCallCount).toBeGreaterThan(0);

    hoisted.controller.resolvedViewport = { x: 160, y: -44, zoom: 1.25 };
    hoisted.controller.viewportTransform =
      "translate3d(160px, -44px, 0) scale(1.25)";

    await act(async () => {
      root.render(<SettingsGraphSubstrateCanary />);
    });

    expect(mockedSectionsLayer.mock.calls.length).toBe(
      initialSectionsLayerCallCount,
    );
  });

  it("records the presented-scene-section visibility split during active motion capture", async () => {
    updateSettingsGraphSubstrateCanaryInstrumentationSnapshot({
      motionAttributionActive: true,
    });

    await act(async () => {
      root.render(<SettingsGraphSubstrateCanary />);
    });

    const presentedSceneVisibleViewportWorldRectResolveEntry =
      readSettingsGraphSubstrateCanaryInstrumentationSnapshot()
        .motionAttribution.presentedSceneVisibleViewportWorldRectResolve;
    expect(presentedSceneVisibleViewportWorldRectResolveEntry.count).toBe(1);
    expect(
      presentedSceneVisibleViewportWorldRectResolveEntry.maxDurationMs,
    ).toBeGreaterThan(0);
    expect(
      presentedSceneVisibleViewportWorldRectResolveEntry.totalDurationMs,
    ).toBeGreaterThan(0);
    const presentedSceneSectionVisibilityFilterEntry =
      readSettingsGraphSubstrateCanaryInstrumentationSnapshot()
        .motionAttribution.presentedSceneSectionVisibilityFilter;
    expect(presentedSceneSectionVisibilityFilterEntry.count).toBe(1);
    expect(
      presentedSceneSectionVisibilityFilterEntry.maxDurationMs,
    ).toBeGreaterThan(0);
    expect(
      presentedSceneSectionVisibilityFilterEntry.totalDurationMs,
    ).toBeGreaterThan(0);
    const presentedSceneSectionSubtreeReactRenderEntry =
      readSettingsGraphSubstrateCanaryInstrumentationSnapshot()
        .motionAttribution.presentedSceneSectionSubtreeReactRender;
    expect(presentedSceneSectionSubtreeReactRenderEntry.count).toBe(1);
    expect(
      presentedSceneSectionSubtreeReactRenderEntry.maxDurationMs,
    ).toBeGreaterThan(0);
    expect(
      presentedSceneSectionSubtreeReactRenderEntry.totalDurationMs,
    ).toBeGreaterThan(0);
    const presentedSceneBodyMountFilterEntry =
      readSettingsGraphSubstrateCanaryInstrumentationSnapshot()
        .motionAttribution.presentedSceneBodyMountFilter;
    expect(presentedSceneBodyMountFilterEntry.count).toBe(1);
    expect(presentedSceneBodyMountFilterEntry.maxDurationMs).toBeGreaterThan(0);
    expect(
      readSettingsGraphSubstrateCanaryInstrumentationSnapshot()
        .mountedSectionBodyCount,
    ).toBe(1);
  });
});
