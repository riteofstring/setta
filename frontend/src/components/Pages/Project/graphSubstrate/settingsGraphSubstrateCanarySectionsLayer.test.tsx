/* @vitest-environment jsdom */

import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SettingsGraphSubstrateCanarySceneSection } from "./settingsGraphSubstrateCanarySceneSnapshot";
import { SettingsGraphSubstrateCanarySectionsLayer } from "./settingsGraphSubstrateCanarySectionsLayer";

const { mockSectionContainer } = vi.hoisted(() => ({
  mockSectionContainer: vi.fn(
    ({ sectionId }: { sectionId: string; isTopLevel: boolean }) => (
      <div data-testid={`section-content-${sectionId}`}>{sectionId}</div>
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

  it("rerenders the layer when drag state changes the rendered section shell", async () => {
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

    // Dragging state changes the visible cursor/data flags, so the layer must commit again.
    await act(async () => {
      root.render(
        <SectionsLayerProbe
          draggingSectionId={"section-a"}
          sceneSections={sceneSections}
          viewportTick={1}
        />,
      );
    });

    expect(mockSectionContainer).toHaveBeenCalledTimes(2);
  });
});

function createSceneSection(
  overrides: Partial<SettingsGraphSubstrateCanarySceneSection> = {},
): SettingsGraphSubstrateCanarySceneSection {
  return {
    height: 160,
    position: { x: 120, y: 80 },
    positionAndSizeLocked: false,
    renderedPosition: { x: 120, y: 80 },
    resolvedSize: { width: 240, height: 160 },
    sectionId: "section-a",
    tempZIndex: 2,
    width: 240,
    zIndex: 2,
    ...overrides,
  };
}

function createSectionDragController() {
  return {
    cleanup: vi.fn(),
    finishSectionDrag: vi.fn(() => false),
    handleSectionPointerDown: vi.fn(() => false),
    handleSectionPointerMove: vi.fn(() => false),
  };
}
