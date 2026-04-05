import { describe, expect, it, vi } from "vitest";
import type { SettingsGraphSubstrateCanarySceneSection } from "./settingsGraphSubstrateCanarySceneSnapshot";
import {
  createSettingsGraphSubstrateCanaryViewportController,
  type SettingsGraphSubstrateCanaryViewportControllerState,
} from "./settingsGraphSubstrateCanaryViewportController";
import {
  centerViewportOnWorldPoint,
  fitViewportToWorldRect,
  type GraphViewport,
} from "./viewportTransform";

function createSceneSection(
  overrides: Partial<SettingsGraphSubstrateCanarySceneSection> = {},
): SettingsGraphSubstrateCanarySceneSection {
  const renderSize =
    "renderSize" in overrides
      ? overrides.renderSize ?? null
      : { width: 200, height: 100 };
  const width =
    "width" in overrides ? overrides.width ?? null : renderSize?.width ?? null;
  const height =
    "height" in overrides
      ? overrides.height ?? null
      : renderSize?.height ?? null;
  const sizeAuthority =
    overrides.sizeAuthority ?? (width && height ? "layout" : undefined);

  return {
    sectionId: "section-1",
    position: { x: 0, y: 0 },
    renderedPosition: { x: 0, y: 0 },
    zIndex: 1,
    tempZIndex: 1,
    width,
    height,
    renderSize,
    sceneBoundsSize:
      overrides.sceneBoundsSize ??
      (renderSize &&
      (sizeAuthority === "layout" || sizeAuthority === "sectionModel")
        ? renderSize
        : width && height
          ? { width, height }
          : null),
    positionAndSizeLocked: false,
    ...(sizeAuthority ? { sizeAuthority } : {}),
    ...overrides,
  };
}

function createState(
  overrides: Partial<SettingsGraphSubstrateCanaryViewportControllerState> = {},
): SettingsGraphSubstrateCanaryViewportControllerState {
  const section = createSceneSection();
  return {
    resolvedViewport: { x: 10, y: 20, zoom: 1.5 },
    sceneSnapshot: {
      sceneBounds: { x: 0, y: 0, width: 200, height: 100 },
      sections: [section],
      sectionsById: new Map([[section.sectionId, section]]),
    },
    wrapperDimensions: { width: 1000, height: 600 },
    ...overrides,
  };
}

function createApplyHarness() {
  let latestBuilder:
    | ((currentViewport: GraphViewport) => GraphViewport | null)
    | null = null;
  const applyControlledViewportChange = vi.fn(
    (builder: (currentViewport: GraphViewport) => GraphViewport | null) => {
      latestBuilder = builder;
    },
  );

  return {
    applyControlledViewportChange,
    resolveNextViewport(currentViewport: GraphViewport) {
      if (!latestBuilder) {
        throw new Error("Expected applyControlledViewportChange to be called.");
      }
      return latestBuilder(currentViewport);
    },
  };
}

describe("settingsGraphSubstrateCanaryViewportController", () => {
  it("skips pan writes when the requested delta is zero", () => {
    // Validates the extracted controller preserves the canary no-op guard.
    const harness = createApplyHarness();
    const controller = createSettingsGraphSubstrateCanaryViewportController({
      applyControlledViewportChange: harness.applyControlledViewportChange,
      getPaneWidths: () => ({ overviewWidth: 320, uiEditorWidth: 0 }),
      getSettings: () => ({
        defaultZoomLevel: 1,
        maxZoom: 4,
        minZoom: 0.1,
      }),
      getState: () => createState(),
      getToolbarZoomViewportBase: () => null,
    });

    expect(controller.panBy({ x: 0, y: 0 })).toBe(false);
    expect(harness.applyControlledViewportChange).not.toHaveBeenCalled();
  });

  it("routes pan updates through the shared viewport-owner callback", () => {
    // Validates the controller split keeps canary pan math behind one boundary.
    const state = createState();
    const harness = createApplyHarness();
    const controller = createSettingsGraphSubstrateCanaryViewportController({
      applyControlledViewportChange: harness.applyControlledViewportChange,
      getPaneWidths: () => ({ overviewWidth: 320, uiEditorWidth: 0 }),
      getSettings: () => ({
        defaultZoomLevel: 1,
        maxZoom: 4,
        minZoom: 0.1,
      }),
      getState: () => state,
      getToolbarZoomViewportBase: () => null,
    });

    expect(controller.panBy({ x: 25, y: -10 })).toBe(true);
    expect(harness.applyControlledViewportChange).toHaveBeenCalledTimes(1);
    expect(harness.resolveNextViewport(state.resolvedViewport!)).toEqual({
      x: 35,
      y: 10,
      zoom: 1.5,
    });
  });

  it("fits only the requested sections and caps initial zoom to the default level", () => {
    // Validates fit-view still honors targeted bounds after the controller split.
    const firstSection = createSceneSection();
    const secondSection = createSceneSection({
      sectionId: "section-2",
      position: { x: 500, y: 100 },
      renderedPosition: { x: 500, y: 100 },
      width: 400,
      height: 200,
      renderSize: { width: 400, height: 200 },
    });
    const state = createState({
      sceneSnapshot: {
        sceneBounds: { x: 0, y: 0, width: 900, height: 300 },
        sections: [firstSection, secondSection],
        sectionsById: new Map([
          [firstSection.sectionId, firstSection],
          [secondSection.sectionId, secondSection],
        ]),
      },
    });
    const harness = createApplyHarness();
    const controller = createSettingsGraphSubstrateCanaryViewportController({
      applyControlledViewportChange: harness.applyControlledViewportChange,
      getPaneWidths: () => ({ overviewWidth: 320, uiEditorWidth: 0 }),
      getSettings: () => ({
        defaultZoomLevel: 1,
        maxZoom: 4,
        minZoom: 0.1,
      }),
      getState: () => state,
      getToolbarZoomViewportBase: () => null,
    });

    expect(
      controller.fitView({
        initial: true,
        nodes: [{ id: secondSection.sectionId }],
      }),
    ).toBe(true);
    expect(harness.applyControlledViewportChange).toHaveBeenCalledTimes(1);
    expect(harness.resolveNextViewport(state.resolvedViewport!)).toEqual(
      fitViewportToWorldRect(
        { x: 500, y: 100, width: 400, height: 200 },
        { width: 680, height: 600 },
        {
          minZoom: 0.1,
          maxZoom: 1,
          padding: 0.1,
          centerScreenPoint: { x: 660, y: 300 },
        },
      ),
    );
  });

  it("centers against the visible graph area when overview chrome is open", () => {
    // Validates center-targeted actions keep using the legacy visible viewport.
    const state = createState();
    const harness = createApplyHarness();
    const controller = createSettingsGraphSubstrateCanaryViewportController({
      applyControlledViewportChange: harness.applyControlledViewportChange,
      getPaneWidths: () => ({ overviewWidth: 320, uiEditorWidth: 0 }),
      getSettings: () => ({
        defaultZoomLevel: 1,
        maxZoom: 4,
        minZoom: 0.1,
      }),
      getState: () => state,
      getToolbarZoomViewportBase: () => null,
    });

    controller.setCenter(100, 50, { zoom: 2 });
    expect(harness.applyControlledViewportChange).toHaveBeenCalledTimes(1);
    expect(harness.resolveNextViewport(state.resolvedViewport!)).toEqual(
      centerViewportOnWorldPoint(state.resolvedViewport!, {
        worldPoint: { x: 100, y: 50 },
        screenPoint: { x: 660, y: 300 },
        zoom: 2,
      }),
    );
  });

  it("refuses fit view when the current snapshot no longer has authoritative geometry", () => {
    // Validates fit-view now follows the same current-geometry contract as the
    // rest of the canary scene runtime instead of reviving stale bounds.
    const section = createSceneSection({
      height: null,
      renderSize: null,
      width: null,
    });
    const state = createState({
      sceneSnapshot: {
        sceneBounds: null,
        sections: [section],
        sectionsById: new Map([[section.sectionId, section]]),
      },
    });
    const harness = createApplyHarness();
    const controller = createSettingsGraphSubstrateCanaryViewportController({
      applyControlledViewportChange: harness.applyControlledViewportChange,
      getPaneWidths: () => ({ overviewWidth: 320, uiEditorWidth: 0 }),
      getSettings: () => ({
        defaultZoomLevel: 1,
        maxZoom: 4,
        minZoom: 0.1,
      }),
      getState: () => state,
      getToolbarZoomViewportBase: () => null,
    });

    expect(controller.fitView()).toBe(false);
    expect(harness.applyControlledViewportChange).not.toHaveBeenCalled();
  });

  it("refuses fit view for a section whose measured size is still local-only", () => {
    // Validates fit-view does not treat sizeAuthority:none render fallback as
    // authoritative scene geometry.
    const section = createSceneSection({
      height: null,
      renderSize: { width: 280, height: 190 },
      sizeAuthority: "none",
      width: null,
    });
    const state = createState({
      sceneSnapshot: {
        sceneBounds: null,
        sections: [section],
        sectionsById: new Map([[section.sectionId, section]]),
      },
    });
    const harness = createApplyHarness();
    const controller = createSettingsGraphSubstrateCanaryViewportController({
      applyControlledViewportChange: harness.applyControlledViewportChange,
      getPaneWidths: () => ({ overviewWidth: 320, uiEditorWidth: 0 }),
      getSettings: () => ({
        defaultZoomLevel: 1,
        maxZoom: 4,
        minZoom: 0.1,
      }),
      getState: () => state,
      getToolbarZoomViewportBase: () => null,
    });

    expect(controller.fitView({ nodes: [{ id: section.sectionId }] })).toBe(
      false,
    );
    expect(harness.applyControlledViewportChange).not.toHaveBeenCalled();
  });
});
