/* @vitest-environment jsdom */

import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { SectionTypeEnum } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SettingsGraphSubstrateCanarySceneSection } from "./settingsGraphSubstrateCanarySceneSnapshot";
import { SettingsGraphSubstrateCanarySectionsLayer } from "./settingsGraphSubstrateCanarySectionsLayer";

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

vi.mock("components/Section/Container/SectionContainer", () => ({
  SectionContainer: mockSectionContainer,
}));

function SectionsLayerProbe({
  draggingSectionId,
  onHoveredSectionChange = () => {},
  sceneSections,
  viewportTick,
}: {
  draggingSectionId: string | null;
  onHoveredSectionChange?: (sectionId: string | null) => void;
  sceneSections: Array<SettingsGraphSubstrateCanarySceneSection>;
  viewportTick: number;
}) {
  const sectionDragController = useRef(createSectionDragController()).current;

  return (
    <div data-viewport-tick={viewportTick}>
      <SettingsGraphSubstrateCanarySectionsLayer
        draggingSectionId={draggingSectionId}
        onHoveredSectionChange={onHoveredSectionChange}
        sceneSections={sceneSections}
        sectionDragController={sectionDragController}
      />
    </div>
  );
}

describe("SettingsGraphSubstrateCanarySectionsLayer", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mockSectionContainer.mockClear();
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

  it("skips rerendering the section wrapper layer on parent viewport-only updates", async () => {
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

    // A viewport-only parent update should keep the section wrapper subtree memoized.
    await act(async () => {
      root.render(
        <SectionsLayerProbe
          draggingSectionId={null}
          sceneSections={sceneSections}
          viewportTick={1}
        />,
      );
    });

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
  const resolvedSize =
    "resolvedSize" in overrides
      ? overrides.resolvedSize ?? null
      : { width: 240, height: 160 };
  const width =
    "width" in overrides
      ? overrides.width ?? null
      : resolvedSize?.width ?? null;
  const height =
    "height" in overrides
      ? overrides.height ?? null
      : resolvedSize?.height ?? null;
  const sizeAuthority =
    overrides.sizeAuthority ?? (width && height ? "layout" : undefined);

  return {
    height,
    isActiveSection: false,
    isInOtherProjectConfigs: false,
    position: { x: 120, y: 80 },
    positionAndSizeLocked: false,
    renderedPosition: { x: 120, y: 80 },
    resolvedSize,
    sceneBoundsSize:
      overrides.sceneBoundsSize ??
      (resolvedSize &&
      (sizeAuthority === "layout" || sizeAuthority === "sectionModel")
        ? resolvedSize
        : width && height
          ? { width, height }
          : null),
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

function createSectionDragController() {
  return {
    cancelSectionDrag: vi.fn(),
    cleanup: vi.fn(),
    finishSectionDrag: vi.fn(() => false),
    handleSectionPointerDown: vi.fn(() => false),
    handleSectionPointerMove: vi.fn(() => false),
  };
}
