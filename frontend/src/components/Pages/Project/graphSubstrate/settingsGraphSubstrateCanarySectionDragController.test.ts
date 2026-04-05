/* @vitest-environment jsdom */

import { useNodeInternals } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GraphSubstrateCanarySection } from "./settingsGraphSubstrateCanaryModel";
import type {
  SettingsGraphSubstrateCanarySceneSection,
  SettingsGraphSubstrateCanarySectionPositionOverride,
} from "./settingsGraphSubstrateCanarySceneSnapshot";
import {
  createSettingsGraphSubstrateCanarySectionDragController,
  type SettingsGraphSubstrateCanarySectionDragController,
} from "./settingsGraphSubstrateCanarySectionDragController";
import type { GraphViewport } from "./viewportTransform";

function createHarness(
  options: {
    nodeDragThreshold?: number;
    resolvedViewport?: GraphViewport | null;
    section?: Partial<SettingsGraphSubstrateCanarySceneSection>;
    snapGrid?: [number, number];
    snapToGrid?: boolean;
    useDefaultEffects?: boolean;
  } = {},
) {
  let draggingSectionId: string | null = null;
  let sectionPositionOverride: SettingsGraphSubstrateCanarySectionPositionOverride =
    null;
  const section = createSection(options.section);
  const sectionById = new Map<string, GraphSubstrateCanarySection>([
    [section.sectionId, toLayoutSection(section)],
  ]);
  const beginSectionDrag = vi.fn();
  const persistSectionDrag = vi.fn();
  const resetSectionTempZIndex = vi.fn();
  const draggingSectionIdHistory: Array<string | null> = [];
  const sectionPositionOverrideHistory: Array<SettingsGraphSubstrateCanarySectionPositionOverride> =
    [];
  const controller: SettingsGraphSubstrateCanarySectionDragController =
    createSettingsGraphSubstrateCanarySectionDragController({
      ...(!options.useDefaultEffects
        ? {
            effects: {
              beginSectionDrag,
              persistSectionDrag,
              resetSectionTempZIndex,
            },
          }
        : {}),
      getNodeDragThreshold: () => options.nodeDragThreshold ?? 8,
      getResolvedViewport: () =>
        options.resolvedViewport ?? {
          x: 0,
          y: 0,
          zoom: 2,
        },
      getSectionById: (sectionId) => sectionById.get(sectionId),
      getSnapSettings: () => ({
        snapGrid: options.snapGrid ?? [25, 10],
        snapToGrid: options.snapToGrid ?? true,
      }),
      onDraggingSectionIdChange(nextSectionId) {
        draggingSectionId = nextSectionId;
        draggingSectionIdHistory.push(nextSectionId);
      },
      onSectionPositionOverrideChange(nextOverride) {
        sectionPositionOverride = nextOverride;
        sectionPositionOverrideHistory.push(nextOverride);
      },
    });

  return {
    beginSectionDrag,
    controller,
    draggingSectionIdHistory,
    getDraggingSectionId: () => draggingSectionId,
    getSection: () => section,
    getSectionPositionOverride: () => sectionPositionOverride,
    persistSectionDrag,
    resetSectionTempZIndex,
    sectionPositionOverrideHistory,
  };
}

function createSection(
  overrides: Partial<SettingsGraphSubstrateCanarySceneSection> = {},
): SettingsGraphSubstrateCanarySceneSection {
  const resolvedSize =
    "resolvedSize" in overrides
      ? overrides.resolvedSize ?? null
      : { width: 180, height: 90 };
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
    position: { x: 100, y: 200 },
    positionAndSizeLocked: false,
    renderedPosition: { x: 100, y: 200 },
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
    tempZIndex: 3,
    width,
    zIndex: 3,
    ...(sizeAuthority ? { sizeAuthority } : {}),
    ...overrides,
  };
}

function toLayoutSection(
  section: SettingsGraphSubstrateCanarySceneSection,
): GraphSubstrateCanarySection {
  return {
    height: section.height,
    position: section.position,
    positionAndSizeLocked: section.positionAndSizeLocked,
    sectionId: section.sectionId,
    tempZIndex: section.tempZIndex,
    width: section.width,
    zIndex: section.zIndex,
  };
}

describe("settingsGraphSubstrateCanarySectionDragController", () => {
  beforeEach(() => {
    resetProjectStores();
    useNodeInternals.setState({ x: new Map() });
  });

  it("starts an immediate drag session when the threshold is zero", () => {
    const harness = createHarness({
      nodeDragThreshold: 0,
    });

    expect(
      harness.controller.handleSectionPointerDown({
        button: 0,
        clientX: 160,
        clientY: 240,
        pointerId: 7,
        section: harness.getSection(),
        target: document.body,
      }),
    ).toBe(true);

    expect(harness.beginSectionDrag).toHaveBeenCalledWith(harness.getSection());
    expect(harness.getDraggingSectionId()).toBe("section-a");
    expect(harness.getSectionPositionOverride()).toBeNull();
  });

  it("starts after the threshold, updates the drag override, and persists the snapped end position", () => {
    const harness = createHarness();

    expect(
      harness.controller.handleSectionPointerDown({
        button: 0,
        clientX: 120,
        clientY: 140,
        pointerId: 9,
        section: harness.getSection(),
        target: document.body,
      }),
    ).toBe(true);
    expect(harness.beginSectionDrag).not.toHaveBeenCalled();

    expect(
      harness.controller.handleSectionPointerMove({
        clientX: 124,
        clientY: 144,
        pointerId: 9,
      }),
    ).toBe(false);
    expect(harness.getDraggingSectionId()).toBeNull();

    expect(
      harness.controller.handleSectionPointerMove({
        clientX: 140,
        clientY: 170,
        pointerId: 9,
      }),
    ).toBe(true);
    expect(harness.beginSectionDrag).toHaveBeenCalledTimes(1);
    expect(harness.getDraggingSectionId()).toBe("section-a");

    expect(
      harness.controller.handleSectionPointerMove({
        clientX: 160,
        clientY: 180,
        pointerId: 9,
      }),
    ).toBe(true);
    expect(harness.getSectionPositionOverride()).toEqual({
      sectionId: "section-a",
      position: { x: 110, y: 205 },
    });

    expect(
      harness.controller.finishSectionDrag({
        persistLayout: true,
        pointerId: 9,
      }),
    ).toBe(true);
    expect(harness.persistSectionDrag).toHaveBeenCalledWith(
      {
        height: 90,
        position: { x: 100, y: 200 },
        positionAndSizeLocked: false,
        sectionId: "section-a",
        tempZIndex: 3,
        width: 180,
        zIndex: 3,
      },
      { x: 100, y: 210 },
    );
    expect(harness.getDraggingSectionId()).toBeNull();
    expect(harness.getSectionPositionOverride()).toBeNull();
  });

  it("resets temp z-index when a started drag is cancelled", () => {
    const harness = createHarness({
      nodeDragThreshold: 0,
    });

    harness.controller.handleSectionPointerDown({
      button: 0,
      clientX: 160,
      clientY: 240,
      pointerId: 11,
      section: harness.getSection(),
      target: document.body,
    });

    harness.controller.cancelSectionDrag();

    expect(harness.resetSectionTempZIndex).toHaveBeenCalledWith("section-a");
    expect(harness.getDraggingSectionId()).toBeNull();
    expect(harness.getSectionPositionOverride()).toBeNull();
  });

  it("keeps local measured fallback size out of node internals when drag bootstrap creates a canary node", () => {
    const section = createSection({
      height: null,
      resolvedSize: { width: 280, height: 190 },
      sceneBoundsSize: null,
      sizeAuthority: "none",
      width: null,
    });
    const controller = createSettingsGraphSubstrateCanarySectionDragController({
      getNodeDragThreshold: () => 0,
      getResolvedViewport: () => ({
        x: 0,
        y: 0,
        zoom: 2,
      }),
      getSectionById: () => section,
      getSnapSettings: () => ({
        snapGrid: [25, 10],
        snapToGrid: true,
      }),
      onDraggingSectionIdChange() {},
      onSectionPositionOverrideChange() {},
    });

    expect(
      controller.handleSectionPointerDown({
        button: 0,
        clientX: 160,
        clientY: 240,
        pointerId: 21,
        section,
        target: document.body,
      }),
    ).toBe(true);

    expect(useNodeInternals.getState().x.get("section-a")).toEqual({
      height: null,
      id: "section-a",
      position: { x: 100, y: 200 },
      tempZIndex: 3,
      width: null,
      zIndex: 3,
    });
  });

  it("ignores blocked targets and locked sections", () => {
    const harness = createHarness();
    const blockedTarget = document.createElement("input");

    expect(
      harness.controller.handleSectionPointerDown({
        button: 0,
        clientX: 160,
        clientY: 240,
        pointerId: 13,
        section: harness.getSection(),
        target: blockedTarget,
      }),
    ).toBe(false);
    expect(
      harness.controller.handleSectionPointerDown({
        button: 0,
        clientX: 160,
        clientY: 240,
        pointerId: 14,
        section: createSection({
          positionAndSizeLocked: true,
          sectionId: "locked-section",
        }),
        target: document.body,
      }),
    ).toBe(false);
    expect(harness.beginSectionDrag).not.toHaveBeenCalled();
    expect(harness.draggingSectionIdHistory).toEqual([]);
    expect(harness.sectionPositionOverrideHistory).toEqual([]);
  });
});
