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
        isDragging,
        section,
      }: {
        children: ReactNode;
        isDragging: boolean;
        section: SettingsGraphSubstrateCanarySceneSection;
      }) => (
        <div
          data-dragging={isDragging ? "true" : "false"}
          data-testid={`shell-${section.sectionId}`}
        >
          {children}
        </div>
      ),
    ),
  }));
const { measureMotionAttribution, recordMotionAttributionDuration } =
  vi.hoisted(() => ({
    measureMotionAttribution: vi.fn((_owner: string, fn: () => unknown) =>
      fn(),
    ),
    recordMotionAttributionDuration: vi.fn(),
  }));

vi.mock("./settingsGraphSubstrateCanarySectionBodyAdapter", () => ({
  resolveSettingsGraphSubstrateCanarySectionBody: mockResolveSectionBody,
  SettingsGraphSubstrateCanarySectionBodyDomAdapter: mockSectionBodyDomAdapter,
}));

vi.mock("./settingsGraphSubstrateCanarySectionShell", () => ({
  SettingsGraphSubstrateCanarySectionShell: mockSectionShell,
}));
vi.mock("./settingsGraphSubstrateCanaryInstrumentation", () => ({
  measureSettingsGraphSubstrateCanaryMotionAttribution:
    measureMotionAttribution,
  recordSettingsGraphSubstrateCanaryMotionAttributionDuration:
    recordMotionAttributionDuration,
  updateSettingsGraphSubstrateCanaryInstrumentationSnapshot: vi.fn(),
}));

import { SettingsGraphSubstrateCanarySectionsLayer } from "./settingsGraphSubstrateCanarySectionsLayer";

const NOOP_HOVERED_SECTION_CHANGE = () => {};

function SectionsLayerProbe({
  draggingSectionId,
  sceneSections,
  viewport,
  visibleViewportRect = DEFAULT_VISIBLE_VIEWPORT_RECT,
}: {
  draggingSectionId: string | null;
  sceneSections: Array<SettingsGraphSubstrateCanarySceneSection>;
  viewport: GraphViewport | null;
  visibleViewportRect?: GraphRect | null;
}) {
  const sectionDragController = useRef(createSectionDragController()).current;

  return (
    <SettingsGraphSubstrateCanarySectionsLayer
      draggingSectionId={draggingSectionId}
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
    measureMotionAttribution.mockClear();
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
    expect(measureMotionAttribution).toHaveBeenCalledWith(
      "presentedSceneSectionEntriesResolve",
      expect.any(Function),
    );

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
    expect(
      measureMotionAttribution.mock.calls.filter(
        ([owner]) => owner === "presentedSceneSectionEntriesResolve",
      ),
    ).toHaveLength(1);
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

  it("keeps the mounted body subtree out of position-only shell rerenders", async () => {
    const sceneSections = [createSceneSection({ sectionId: "section-a" })];

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
          sceneSections={[
            createSceneSection({
              position: { x: 180, y: 120 },
              renderedPosition: { x: 180, y: 120 },
              sectionId: "section-a",
            }),
          ]}
          viewport={{ x: 0, y: 0, zoom: 1 }}
        />,
      );
    });

    expect(mockResolveSectionBody).toHaveBeenCalledTimes(1);
    expect(mockSectionShell).toHaveBeenCalledTimes(2);
    expect(mockSectionBodyDomAdapter).toHaveBeenCalledTimes(1);
  });

  it("rerenders only the changed sibling when one section body input changes", async () => {
    const sceneSections = [
      createSceneSection({ sectionId: "section-a" }),
      createSceneSection({
        position: { x: 420, y: 80 },
        renderedPosition: { x: 420, y: 80 },
        sectionId: "section-b",
      }),
    ];

    await act(async () => {
      root.render(
        <SectionsLayerProbe
          draggingSectionId={null}
          sceneSections={sceneSections}
          viewport={{ x: 0, y: 0, zoom: 1 }}
        />,
      );
    });

    expect(mockResolveSectionBody).toHaveBeenCalledTimes(2);
    expect(mockSectionShell).toHaveBeenCalledTimes(2);
    expect(mockSectionBodyDomAdapter).toHaveBeenCalledTimes(2);

    await act(async () => {
      root.render(
        <SectionsLayerProbe
          draggingSectionId={null}
          sceneSections={[
            sceneSections[0]!,
            createSceneSection({
              position: { x: 420, y: 80 },
              renderedPosition: { x: 420, y: 80 },
              sectionId: "section-b",
              styleColor: "blue",
            }),
          ]}
          viewport={{ x: 0, y: 0, zoom: 1 }}
        />,
      );
    });

    expect(mockResolveSectionBody).toHaveBeenCalledTimes(3);
    expect(mockSectionShell).toHaveBeenCalledTimes(3);
    expect(mockSectionBodyDomAdapter).toHaveBeenCalledTimes(3);
  });

  it("rerenders only the dragged sibling when drag state flips", async () => {
    const sceneSections = [
      createSceneSection({ sectionId: "section-a" }),
      createSceneSection({
        position: { x: 420, y: 80 },
        renderedPosition: { x: 420, y: 80 },
        sectionId: "section-b",
      }),
    ];

    await act(async () => {
      root.render(
        <SectionsLayerProbe
          draggingSectionId={null}
          sceneSections={sceneSections}
          viewport={{ x: 0, y: 0, zoom: 1 }}
        />,
      );
    });

    expect(mockResolveSectionBody).toHaveBeenCalledTimes(2);
    expect(mockSectionShell).toHaveBeenCalledTimes(2);
    expect(mockSectionBodyDomAdapter).toHaveBeenCalledTimes(2);

    await act(async () => {
      root.render(
        <SectionsLayerProbe
          draggingSectionId={"section-b"}
          sceneSections={sceneSections}
          viewport={{ x: 0, y: 0, zoom: 1 }}
        />,
      );
    });

    expect(mockResolveSectionBody).toHaveBeenCalledTimes(2);
    expect(mockSectionShell).toHaveBeenCalledTimes(3);
    expect(mockSectionBodyDomAdapter).toHaveBeenCalledTimes(2);
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
    hasEmbeddedTerminal: false,
    height,
    isActiveSection: false,
    isMinimized: false,
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
