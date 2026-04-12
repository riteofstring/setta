/* @vitest-environment jsdom */

import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { SectionTypeEnum } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SettingsGraphSubstrateCanarySceneSection } from "./settingsGraphSubstrateCanarySceneSnapshot";
import { SettingsGraphSubstrateCanarySectionsLayer } from "./settingsGraphSubstrateCanarySectionsLayer";
import type { GraphRect, GraphViewport } from "./viewportTransform";

const { mockSectionContainer } = vi.hoisted(() => ({
  mockSectionContainer: vi.fn(
    ({
      bodySurfaceOverride,
      sectionId,
      isTopLevel,
      forceHideOutline,
      forceHideFrameBorder,
      forceTransparentBorder,
      forceTransparentBackground,
      forceHideTopDragHandle,
    }: {
      bodySurfaceOverride?: {
        bgColor: string;
        surfaceDecorations: {
          layout: string;
          showTopDragHandle: boolean;
        };
      };
      sectionId: string;
      isTopLevel: boolean;
      forceHideOutline?: boolean;
      forceHideFrameBorder?: boolean;
      forceTransparentBackground?: boolean;
      forceTransparentBorder?: boolean;
      forceHideTopDragHandle?: boolean;
    }) => (
      <div
        data-force-hide-outline={forceHideOutline ? "true" : "false"}
        data-force-hide-frame-border={forceHideFrameBorder ? "true" : "false"}
        data-is-top-level={isTopLevel ? "true" : "false"}
        data-force-transparent-border={
          forceTransparentBorder ? "true" : "false"
        }
        data-force-transparent-background={
          forceTransparentBackground ? "true" : "false"
        }
        data-force-hide-top-drag-handle={
          forceHideTopDragHandle ? "true" : "false"
        }
        data-surface-bg-color={bodySurfaceOverride?.bgColor ?? ""}
        data-surface-layout={
          bodySurfaceOverride?.surfaceDecorations.layout ?? ""
        }
        data-surface-show-top-drag-handle={
          bodySurfaceOverride?.surfaceDecorations.showTopDragHandle
            ? "true"
            : "false"
        }
        data-testid={`section-content-${sectionId}`}
      >
        {sectionId}
      </div>
    ),
  ),
}));

const { measureMotionAttribution, updateInstrumentationSnapshot } = vi.hoisted(
  () => ({
    measureMotionAttribution: vi.fn((_owner: string, fn: () => unknown) =>
      fn(),
    ),
    updateInstrumentationSnapshot: vi.fn(),
  }),
);

vi.mock("components/Section/Container/SectionContainer", () => ({
  SectionContainer: mockSectionContainer,
}));

vi.mock("./settingsGraphSubstrateCanaryInstrumentation", () => ({
  measureSettingsGraphSubstrateCanaryMotionAttribution:
    measureMotionAttribution,
  updateSettingsGraphSubstrateCanaryInstrumentationSnapshot:
    updateInstrumentationSnapshot,
}));

function SectionsLayerProbe({
  draggingSectionId,
  mountedSectionBodyIds,
  onHoveredSectionChange = () => {},
  presentedSceneSections,
  sceneSections,
  viewport = DEFAULT_VIEWPORT,
  viewportTick,
  visibleViewportRect = DEFAULT_VISIBLE_VIEWPORT_RECT,
}: {
  draggingSectionId: string | null;
  mountedSectionBodyIds?: ReadonlySet<string>;
  onHoveredSectionChange?: (sectionId: string | null) => void;
  presentedSceneSections?: Array<SettingsGraphSubstrateCanarySceneSection>;
  sceneSections: Array<SettingsGraphSubstrateCanarySceneSection>;
  viewport?: GraphViewport | null;
  viewportTick: number;
  visibleViewportRect?: GraphRect | null;
}) {
  const sectionDragController = useRef(createSectionDragController()).current;

  return (
    <div data-viewport-tick={viewportTick}>
      <SettingsGraphSubstrateCanarySectionsLayer
        draggingSectionId={draggingSectionId}
        mountedSectionBodyIds={mountedSectionBodyIds}
        onHoveredSectionChange={onHoveredSectionChange}
        presentedSceneSections={presentedSceneSections}
        sceneSections={sceneSections}
        sectionDragController={sectionDragController}
        viewport={viewport}
        visibleViewportRect={visibleViewportRect}
      />
    </div>
  );
}

describe("SettingsGraphSubstrateCanarySectionsLayer", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mockSectionContainer.mockClear();
    measureMotionAttribution.mockClear();
    updateInstrumentationSnapshot.mockReset();
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
  });

  it("keeps the visible DOM body memoized on viewport-only updates", async () => {
    const sceneSections = [createSceneSection()];

    await act(async () => {
      root.render(
        <SectionsLayerProbe
          draggingSectionId={null}
          sceneSections={sceneSections}
          viewport={{ x: 0, y: 0, zoom: 1 }}
          viewportTick={0}
        />,
      );
    });

    // A viewport-only update should not force the already-visible DOM body to rerender.
    await act(async () => {
      root.render(
        <SectionsLayerProbe
          draggingSectionId={null}
          sceneSections={sceneSections}
          viewport={{ x: -24, y: 12, zoom: 1 }}
          viewportTick={1}
        />,
      );
    });

    expect(mockSectionContainer).toHaveBeenCalledTimes(1);
    expect(measureMotionAttribution).toHaveBeenCalledWith(
      "presentedSceneBodyMountFilter",
      expect.any(Function),
    );
  });

  it("uses the precomputed mounted-body ids without rerunning the body filter", async () => {
    const sceneSections = [createSceneSection()];
    const mountedSectionBodyIds = new Set(["section-a"]);

    await act(async () => {
      root.render(
        <SectionsLayerProbe
          draggingSectionId={null}
          mountedSectionBodyIds={mountedSectionBodyIds}
          presentedSceneSections={sceneSections}
          sceneSections={sceneSections}
          viewport={{ x: 0, y: 0, zoom: 1 }}
          viewportTick={0}
        />,
      );
    });

    expect(
      host.querySelector('[data-testid="section-content-section-a"]'),
    ).not.toBeNull();
    expect(measureMotionAttribution).not.toHaveBeenCalledWith(
      "presentedSceneBodyMountFilter",
      expect.any(Function),
    );
  });

  it("unmounts offscreen inactive section shells and bodies while keeping visible ones mounted", async () => {
    await act(async () => {
      root.render(
        <SectionsLayerProbe
          draggingSectionId={null}
          sceneSections={[
            createSceneSection({ sectionId: "visible-section" }),
            createSceneSection({
              renderedPosition: { x: 1280, y: 80 },
              position: { x: 1280, y: 80 },
              sectionId: "offscreen-section",
            }),
          ]}
          viewport={{ x: 0, y: 0, zoom: 1 }}
          viewportTick={0}
        />,
      );
    });

    expect(
      host.querySelectorAll('[data-testid="graph-substrate-canary-section"]'),
    ).toHaveLength(1);
    expect(
      host.querySelector('[data-testid="section-content-visible-section"]'),
    ).not.toBeNull();
    expect(
      host.querySelector('[data-testid="section-content-offscreen-section"]'),
    ).toBeNull();
    expect(mockSectionContainer).toHaveBeenCalledTimes(1);
  });

  it("unmounts tiny visible inactive section bodies until they have useful screen space", async () => {
    await act(async () => {
      root.render(
        <SectionsLayerProbe
          draggingSectionId={null}
          sceneSections={[createSceneSection()]}
          viewport={{ x: 0, y: 0, zoom: 0.1 }}
          viewportTick={0}
        />,
      );
    });

    expect(
      host.querySelector('[data-testid="section-content-section-a"]'),
    ).toBeNull();
    expect(mockSectionContainer).toHaveBeenCalledTimes(0);
  });

  it("keeps active offscreen section bodies mounted for interaction continuity", async () => {
    await act(async () => {
      root.render(
        <SectionsLayerProbe
          draggingSectionId={null}
          sceneSections={[
            createSceneSection({
              isActiveSection: true,
              renderedPosition: { x: 1280, y: 80 },
              position: { x: 1280, y: 80 },
              sectionId: "active-offscreen-section",
            }),
          ]}
          viewport={{ x: 0, y: 0, zoom: 1 }}
          viewportTick={0}
        />,
      );
    });

    expect(
      host.querySelectorAll('[data-testid="graph-substrate-canary-section"]'),
    ).toHaveLength(1);
    expect(
      host.querySelector(
        '[data-testid="section-content-active-offscreen-section"]',
      ),
    ).not.toBeNull();
    expect(mockSectionContainer).toHaveBeenCalledTimes(1);
  });

  it("keeps active tiny visible section bodies mounted for interaction continuity", async () => {
    await act(async () => {
      root.render(
        <SectionsLayerProbe
          draggingSectionId={null}
          sceneSections={[
            createSceneSection({
              isActiveSection: true,
            }),
          ]}
          viewport={{ x: 0, y: 0, zoom: 0.1 }}
          viewportTick={0}
        />,
      );
    });

    expect(
      host.querySelector('[data-testid="section-content-section-a"]'),
    ).not.toBeNull();
    expect(mockSectionContainer).toHaveBeenCalledTimes(1);
  });

  it("updates shell drag state without rerendering the section body", async () => {
    const sceneSections = [createSceneSection()];

    await act(async () => {
      root.render(
        <SectionsLayerProbe
          draggingSectionId={null}
          sceneSections={sceneSections}
          viewportTick={0}
        />,
      );
    });

    const initialSection = host.querySelector<HTMLElement>(
      '[data-testid="graph-substrate-canary-section"]',
    );
    expect(initialSection?.dataset.dragging).toBe("false");

    // Dragging state changes the visible shell flags, but not the DOM-backed body.
    await act(async () => {
      root.render(
        <SectionsLayerProbe
          draggingSectionId={"section-a"}
          sceneSections={sceneSections}
          viewportTick={1}
        />,
      );
    });

    const draggingSection = host.querySelector<HTMLElement>(
      '[data-testid="graph-substrate-canary-section"]',
    );
    expect(draggingSection?.dataset.dragging).toBe("true");
    expect(mockSectionContainer).toHaveBeenCalledTimes(1);
  });

  it("updates shell positioning without rerendering the section body", async () => {
    await act(async () => {
      root.render(
        <SectionsLayerProbe
          draggingSectionId={null}
          sceneSections={[
            createSceneSection({
              renderedPosition: { x: 120, y: 80 },
              tempZIndex: 2,
            }),
          ]}
          viewportTick={0}
        />,
      );
    });

    const initialSection = host.querySelector<HTMLElement>(
      '[data-testid="graph-substrate-canary-section"]',
    );
    expect(initialSection?.style.transform).toContain("120px");

    await act(async () => {
      root.render(
        <SectionsLayerProbe
          draggingSectionId={null}
          sceneSections={[
            createSceneSection({
              renderedPosition: { x: 260, y: 140 },
              tempZIndex: 8,
            }),
          ]}
          viewportTick={1}
        />,
      );
    });

    const movedSection = host.querySelector<HTMLElement>(
      '[data-testid="graph-substrate-canary-section"]',
    );
    expect(movedSection?.style.transform).toContain("260px");
    expect(movedSection?.style.zIndex).toBe("8");
    expect(mockSectionContainer).toHaveBeenCalledTimes(1);
  });

  it("publishes shell hover changes without rerendering the DOM-backed body", async () => {
    const onHoveredSectionChange = vi.fn();

    await act(async () => {
      root.render(
        <SectionsLayerProbe
          draggingSectionId={null}
          onHoveredSectionChange={onHoveredSectionChange}
          sceneSections={[createSceneSection()]}
          viewportTick={0}
        />,
      );
    });

    const section = host.querySelector<HTMLElement>(
      '[data-testid="graph-substrate-canary-section"]',
    );
    expect(section).not.toBeNull();

    await act(async () => {
      section?.dispatchEvent(
        new PointerEvent("pointerover", { bubbles: true, relatedTarget: null }),
      );
    });
    await act(async () => {
      section?.dispatchEvent(
        new PointerEvent("pointerout", { bubbles: true, relatedTarget: null }),
      );
    });

    expect(onHoveredSectionChange.mock.calls).toEqual([["section-a"], [null]]);
    expect(mockSectionContainer).toHaveBeenCalledTimes(1);
  });

  it("keeps the duplicate DOM outline suppressed for the root Pixi shell layer", async () => {
    await act(async () => {
      root.render(
        <SectionsLayerProbe
          draggingSectionId={null}
          sceneSections={[
            createSceneSection({
              isActiveSection: true,
            }),
          ]}
          viewportTick={0}
        />,
      );
    });

    const outline = host.querySelector<HTMLElement>(
      '[data-testid="graph-substrate-canary-section-outline"]',
    );
    expect(outline).toBeNull();
    expect(mockSectionContainer.mock.calls[0]?.[0]).toMatchObject({
      forceHideOutline: true,
      isTopLevel: true,
      sectionId: "section-a",
    });
  });

  it("keeps the DOM shell border transparent while the root Pixi shell layer owns the visible border", async () => {
    await act(async () => {
      root.render(
        <SectionsLayerProbe
          draggingSectionId={null}
          sceneSections={[createSceneSection()]}
          viewportTick={0}
        />,
      );
    });

    const border = host.querySelector<HTMLElement>(
      '[data-testid="graph-substrate-canary-section-border"]',
    );
    expect(border).toBeNull();
    expect(mockSectionContainer.mock.calls[0]?.[0]).toMatchObject({
      bodySurfaceOverride: {
        bgColor: "bg-transparent",
        surfaceDecorations: {
          layout: "section-grid",
          showTopDragHandle: false,
        },
      },
      forceTransparentBackground: true,
      forceTransparentBorder: true,
      isTopLevel: true,
      sectionId: "section-a",
    });
  });

  it("suppresses the duplicate DOM surface frame once the root Pixi shell layer owns that stroke", async () => {
    await act(async () => {
      root.render(
        <SectionsLayerProbe
          draggingSectionId={null}
          sceneSections={[createSceneSection()]}
          viewportTick={0}
        />,
      );
    });

    expect(mockSectionContainer.mock.calls[0]?.[0]).toMatchObject({
      forceHideFrameBorder: true,
      isTopLevel: true,
      sectionId: "section-a",
    });
  });

  it("suppresses both DOM top drag handle variants once the shell canvas owns that visual", async () => {
    await act(async () => {
      root.render(
        <SectionsLayerProbe
          draggingSectionId={null}
          sceneSections={[
            createSceneSection({
              sectionTypeName: SectionTypeEnum.MetaControl,
            }),
          ]}
          viewportTick={0}
        />,
      );
    });

    expect(
      host.querySelector(
        '[data-testid="graph-substrate-canary-section-top-drag-handle"]',
      ),
    ).toBeNull();
    expect(mockSectionContainer.mock.calls[0]?.[0]).toMatchObject({
      bodySurfaceOverride: {
        surfaceDecorations: {
          layout: "single-cell",
          showTopDragHandle: true,
        },
      },
      forceHideTopDragHandle: true,
      isTopLevel: true,
      sectionId: "section-a",
    });
  });
});

function createSceneSection(
  overrides: Partial<SettingsGraphSubstrateCanarySceneSection> = {},
): SettingsGraphSubstrateCanarySceneSection {
  const width = "width" in overrides ? overrides.width ?? null : 240;
  const height = "height" in overrides ? overrides.height ?? null : 160;
  const sizeAuthority =
    overrides.sizeAuthority ?? (width && height ? "layout" : undefined);

  return {
    height,
    isActiveSection: false,
    isInOtherProjectConfigs: false,
    position: { x: 120, y: 80 },
    positionAndSizeLocked: false,
    renderedPosition: { x: 120, y: 80 },
    sceneBoundsSize:
      overrides.sceneBoundsSize ?? (width && height ? { width, height } : null),
    sectionId: "section-a",
    sectionTypeName: SectionTypeEnum.Code,
    styleColor: null,
    tempZIndex: 2,
    textBlockMetaControlStyle: false,
    width,
    zIndex: 2,
    ...(sizeAuthority ? { sizeAuthority } : {}),
    ...overrides,
  };
}

const DEFAULT_VIEWPORT: GraphViewport = {
  x: 0,
  y: 0,
  zoom: 1,
};

const DEFAULT_VISIBLE_VIEWPORT_RECT: GraphRect = {
  x: 0,
  y: 0,
  width: 720,
  height: 828,
};

function createSectionDragController() {
  return {
    cancelSectionDrag: vi.fn(),
    cleanup: vi.fn(),
    finishSectionDrag: vi.fn(() => false),
    handleSectionPointerDown: vi.fn(() => false),
    handleSectionPointerMove: vi.fn(() => false),
  };
}
