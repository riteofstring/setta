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
      sectionId,
      isTopLevel,
      forceHideOutline,
      forceTransparentBorder,
      forceHideTopDragHandle,
    }: {
      sectionId: string;
      isTopLevel: boolean;
      forceHideOutline?: boolean;
      forceTransparentBorder?: boolean;
      forceHideTopDragHandle?: boolean;
    }) => (
      <div
        data-force-hide-outline={forceHideOutline ? "true" : "false"}
        data-is-top-level={isTopLevel ? "true" : "false"}
        data-force-transparent-border={
          forceTransparentBorder ? "true" : "false"
        }
        data-force-hide-top-drag-handle={
          forceHideTopDragHandle ? "true" : "false"
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
  sceneSections,
  viewportTick,
}: {
  draggingSectionId: string | null;
  sceneSections: Array<SettingsGraphSubstrateCanarySceneSection>;
  viewportTick: number;
}) {
  const sectionDragController = useRef(createSectionDragController()).current;

  return (
    <div data-viewport-tick={viewportTick}>
      <SettingsGraphSubstrateCanarySectionsLayer
        draggingSectionId={draggingSectionId}
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

  it("renders the active outline from the shell while suppressing the duplicate DOM outline", async () => {
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
    expect(outline?.dataset.outlineTone).toBe("active");
    expect(outline?.className).toContain("outline-blue-600");
    expect(mockSectionContainer.mock.calls[0]?.[0]).toMatchObject({
      forceHideOutline: true,
      isTopLevel: true,
      sectionId: "section-a",
    });
  });

  it("renders the shell-owned border while keeping the DOM shell border transparent", async () => {
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
    expect(border?.dataset.borderTone).toBe("default");
    expect(border?.className).toContain("border-white");
    expect(mockSectionContainer.mock.calls[0]?.[0]).toMatchObject({
      forceTransparentBorder: true,
      isTopLevel: true,
      sectionId: "section-a",
    });
  });

  it("renders the shell-owned top drag handle while suppressing the duplicate DOM handle", async () => {
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

    const topDragHandle = host.querySelector<HTMLElement>(
      '[data-testid="graph-substrate-canary-section-top-drag-handle"]',
    );
    expect(topDragHandle?.dataset.resizeHandleTone).toBe("minimal");
    expect(mockSectionContainer.mock.calls[0]?.[0]).toMatchObject({
      forceHideTopDragHandle: true,
      isTopLevel: true,
      sectionId: "section-a",
    });
  });
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
    resolvedSize: { width: 240, height: 160 },
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

function createSectionDragController() {
  return {
    cancelSectionDrag: vi.fn(),
    cleanup: vi.fn(),
    finishSectionDrag: vi.fn(() => false),
    handleSectionPointerDown: vi.fn(() => false),
    handleSectionPointerMove: vi.fn(() => false),
  };
}
