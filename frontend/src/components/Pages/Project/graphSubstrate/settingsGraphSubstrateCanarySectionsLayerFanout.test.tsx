/* @vitest-environment jsdom */

import { act, useRef, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { SectionTypeEnum } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SettingsGraphSubstrateCanarySceneSection } from "./settingsGraphSubstrateCanarySceneSnapshot";
import type { SettingsGraphSubstrateCanarySectionBody } from "./settingsGraphSubstrateCanarySectionBodyAdapter";
import type { GraphRect, GraphViewport } from "./viewportTransform";

const { mockResolveSectionBody, mockSectionBodyDomAdapter, mockSectionShell } =
  vi.hoisted(() => ({
    mockResolveSectionBody: vi.fn(
      (sectionBody: SettingsGraphSubstrateCanarySectionBody) => sectionBody,
    ),
    mockSectionBodyDomAdapter: vi.fn(
      ({
        sectionBody,
      }: {
        sectionBody: SettingsGraphSubstrateCanarySectionBody;
      }) => (
        <div data-testid={`body-${sectionBody.sectionId}`}>
          {sectionBody.sectionId}
        </div>
      ),
    ),
    mockSectionShell: vi.fn(
      ({
        children,
        draggingSectionId,
        section,
      }: {
        children: ReactNode;
        draggingSectionId: string | null;
        section: SettingsGraphSubstrateCanarySceneSection;
      }) => (
        <div
          data-dragging={
            draggingSectionId === section.sectionId ? "true" : "false"
          }
          data-testid={`shell-${section.sectionId}`}
        >
          {children}
        </div>
      ),
    ),
  }));

vi.mock("./settingsGraphSubstrateCanarySectionBodyAdapter", () => ({
  resolveSettingsGraphSubstrateCanarySectionBody: mockResolveSectionBody,
  SettingsGraphSubstrateCanarySectionBodyDomAdapter: mockSectionBodyDomAdapter,
}));

vi.mock("./settingsGraphSubstrateCanarySectionShell", () => ({
  SettingsGraphSubstrateCanarySectionShell: mockSectionShell,
}));

import { SettingsGraphSubstrateCanarySectionsLayer } from "./settingsGraphSubstrateCanarySectionsLayer";

const NOOP_HOVERED_SECTION_CHANGE = () => {};

function SectionsLayerProbe({
  draggingSectionId,
  hoveredSectionId = null,
  sceneSections,
  viewport,
  visibleViewportRect = DEFAULT_VISIBLE_VIEWPORT_RECT,
}: {
  draggingSectionId: string | null;
  hoveredSectionId?: string | null;
  sceneSections: Array<SettingsGraphSubstrateCanarySceneSection>;
  viewport: GraphViewport | null;
  visibleViewportRect?: GraphRect | null;
}) {
  const sectionDragController = useRef(createSectionDragController()).current;

  return (
    <SettingsGraphSubstrateCanarySectionsLayer
      draggingSectionId={draggingSectionId}
      hoveredSectionId={hoveredSectionId}
      onHoveredSectionChange={NOOP_HOVERED_SECTION_CHANGE}
      sceneSections={sceneSections}
      sectionDragController={sectionDragController}
      viewport={viewport}
      visibleViewportRect={visibleViewportRect}
    />
  );
}

describe("SettingsGraphSubstrateCanarySectionsLayer fan-out", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mockResolveSectionBody.mockClear();
    mockSectionBodyDomAdapter.mockClear();
    mockSectionShell.mockClear();
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

  it("keeps section entry rendering memoized on viewport-only motion", async () => {
    const sceneSections = [createSceneSection()];

    await act(async () => {
      root.render(
        <SectionsLayerProbe
          draggingSectionId={null}
          sceneSections={sceneSections}
          viewport={{ x: 0, y: 0, zoom: 1 }}
        />,
      );
    });

    expect(mockResolveSectionBody).toHaveBeenCalledTimes(1);
    expect(mockSectionShell).toHaveBeenCalledTimes(1);
    expect(mockSectionBodyDomAdapter).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.render(
        <SectionsLayerProbe
          draggingSectionId={null}
          sceneSections={sceneSections}
          viewport={{ x: -48, y: 24, zoom: 1 }}
        />,
      );
    });

    expect(mockResolveSectionBody).toHaveBeenCalledTimes(1);
    expect(mockSectionShell).toHaveBeenCalledTimes(1);
    expect(mockSectionBodyDomAdapter).toHaveBeenCalledTimes(1);
  });

  it("rerenders only the affected section entry when the body mount gate changes", async () => {
    const sceneSections = [createSceneSection()];

    await act(async () => {
      root.render(
        <SectionsLayerProbe
          draggingSectionId={null}
          sceneSections={sceneSections}
          viewport={{ x: 0, y: 0, zoom: 0.1 }}
        />,
      );
    });

    expect(mockResolveSectionBody).toHaveBeenCalledTimes(1);
    expect(mockSectionShell).toHaveBeenCalledTimes(1);
    expect(mockSectionBodyDomAdapter).toHaveBeenCalledTimes(0);
    expect(host.querySelector('[data-testid="body-section-a"]')).toBeNull();

    await act(async () => {
      root.render(
        <SectionsLayerProbe
          draggingSectionId={null}
          sceneSections={sceneSections}
          viewport={{ x: 0, y: 0, zoom: 1 }}
        />,
      );
    });

    expect(mockResolveSectionBody).toHaveBeenCalledTimes(1);
    expect(mockSectionShell).toHaveBeenCalledTimes(2);
    expect(mockSectionBodyDomAdapter).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[data-testid="body-section-a"]')).not.toBeNull();
  });

  it("skips body resolution and shell work for offscreen inactive sections", async () => {
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
        />,
      );
    });

    expect(mockResolveSectionBody).toHaveBeenCalledTimes(1);
    expect(mockSectionShell).toHaveBeenCalledTimes(1);
    expect(mockSectionBodyDomAdapter).toHaveBeenCalledTimes(1);
    expect(
      host.querySelector('[data-testid="shell-visible-section"]'),
    ).not.toBeNull();
    expect(
      host.querySelector('[data-testid="shell-offscreen-section"]'),
    ).toBeNull();
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
