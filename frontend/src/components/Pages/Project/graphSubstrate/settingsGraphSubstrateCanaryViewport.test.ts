import { PanOnScrollModeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  fitSettingsGraphSubstrateCanaryViewport,
  resolveSettingsGraphSubstrateCanaryEffectivePaneWidths,
  resolveSettingsGraphSubstrateCanaryFallbackViewport,
  resolveSettingsGraphSubstrateCanarySharedViewport,
  resolveSettingsGraphSubstrateCanaryToolbarZoomViewport,
  resolveSettingsGraphSubstrateCanaryViewport,
  resolveSettingsGraphSubstrateCanaryVisibleViewportSize,
  resolveSettingsGraphSubstrateCanaryWheelOutcome,
  shouldAutoFitSettingsGraphSubstrateCanaryViewport,
  shouldPersistSettingsGraphSubstrateCanaryViewport,
} from "./settingsGraphSubstrateCanaryViewport";

describe("settingsGraphSubstrateCanaryViewport", () => {
  it("prefers the live canary viewport over any shared saved viewport", () => {
    expect(
      resolveSettingsGraphSubstrateCanaryViewport(
        { x: 12, y: -24, zoom: 0.8 },
        { x: 100, y: 200, zoom: 0.2 },
        { x: -72, y: -12, zoom: 0.75 },
      ),
    ).toEqual({
      x: 12,
      y: -24,
      zoom: 0.8,
    });
  });

  it("restores the shared saved viewport before falling back to a fresh fit seed", () => {
    expect(
      resolveSettingsGraphSubstrateCanaryViewport(
        null,
        { x: 320, y: -180, zoom: 0.42 },
        { x: -72, y: -12, zoom: 0.75 },
      ),
    ).toEqual({
      x: 320,
      y: -180,
      zoom: 0.42,
    });
  });

  it("uses the top-left fallback only when no authoritative viewport exists", () => {
    const fallbackViewport =
      resolveSettingsGraphSubstrateCanaryFallbackViewport(
        0.75,
        createSceneSnapshot({
          renderedPosition: { x: 160, y: 80 },
        }),
      );
    expect(fallbackViewport).toEqual({
      x: -72,
      y: -12,
      zoom: 0.75,
    });
    expect(
      resolveSettingsGraphSubstrateCanaryViewport(null, null, fallbackViewport),
    ).toEqual(fallbackViewport);
    expect(shouldAutoFitSettingsGraphSubstrateCanaryViewport(null, null)).toBe(
      true,
    );
    expect(
      shouldAutoFitSettingsGraphSubstrateCanaryViewport(
        { x: 0, y: 0, zoom: 1 },
        null,
      ),
    ).toBe(false);
    expect(
      shouldAutoFitSettingsGraphSubstrateCanaryViewport(null, {
        x: 40,
        y: -20,
        zoom: 0.5,
      }),
    ).toBe(false);
  });

  it("ignores a mirrored reactflow viewport when it only matches the fallback seed", () => {
    const fallbackViewport =
      resolveSettingsGraphSubstrateCanaryFallbackViewport(
        1,
        createSceneSnapshot({
          renderedPosition: { x: 0, y: 0 },
        }),
      );
    expect(
      resolveSettingsGraphSubstrateCanarySharedViewport(
        null,
        fallbackViewport,
        fallbackViewport,
      ),
    ).toBeNull();
  });

  it("still accepts a reactflow shared viewport when it differs from the fallback seed", () => {
    const fallbackViewport =
      resolveSettingsGraphSubstrateCanaryFallbackViewport(
        1,
        createSceneSnapshot({
          renderedPosition: { x: 0, y: 0 },
        }),
      );
    expect(
      resolveSettingsGraphSubstrateCanarySharedViewport(
        null,
        { x: 320, y: -180, zoom: 0.42 },
        fallbackViewport,
      ),
    ).toEqual({
      x: 320,
      y: -180,
      zoom: 0.42,
    });
  });

  it("does not persist a provisional canary viewport before the user owns it", () => {
    expect(
      shouldPersistSettingsGraphSubstrateCanaryViewport(null, "auto-fit"),
    ).toBe(false);
    expect(
      shouldPersistSettingsGraphSubstrateCanaryViewport(null, "shared"),
    ).toBe(false);
  });

  it("persists restored or user-owned canary viewports", () => {
    expect(
      shouldPersistSettingsGraphSubstrateCanaryViewport(
        { x: 320, y: -180, zoom: 0.42 },
        "shared",
      ),
    ).toBe(true);
    expect(
      shouldPersistSettingsGraphSubstrateCanaryViewport(null, "local"),
    ).toBe(true);
  });

  it("uses the rendered scene position instead of the raw section position for fallback seeding", () => {
    expect(
      resolveSettingsGraphSubstrateCanaryFallbackViewport(
        1,
        createSceneSnapshot({
          position: { x: 120, y: 80 },
          renderedPosition: { x: 480, y: 240 },
        }),
      ),
    ).toEqual({
      x: -432,
      y: -192,
      zoom: 1,
    });
  });

  it("fits the canary to the legacy visible center and caps the initial zoom", () => {
    expect(
      fitSettingsGraphSubstrateCanaryViewport(
        { x: 0, y: 0, width: 200, height: 100 },
        { width: 1000, height: 600 },
        {
          minZoom: 0.1,
          maxZoom: 10,
          defaultZoomLevel: 1,
          overviewWidth: 320,
          uiEditorWidth: 0,
        },
      ),
    ).toEqual({
      x: 560,
      y: 250,
      zoom: 1,
    });
  });

  it("mirrors the legacy remembered pane widths when hidden panes stay collapsed", () => {
    const effectivePaneWidths =
      resolveSettingsGraphSubstrateCanaryEffectivePaneWidths({
        overviewTrueWidth: 320,
        uiEditorTrueWidth: 180,
      });
    expect(effectivePaneWidths).toEqual({
      overviewWidth: 320,
      uiEditorWidth: 180,
    });
    expect(
      fitSettingsGraphSubstrateCanaryViewport(
        { x: 0, y: 0, width: 200, height: 100 },
        { width: 1000, height: 600 },
        {
          minZoom: 0.1,
          maxZoom: 10,
          defaultZoomLevel: 1,
          overviewWidth: effectivePaneWidths.overviewWidth,
          uiEditorWidth: effectivePaneWidths.uiEditorWidth,
        },
      ),
    ).toEqual({
      x: 470,
      y: 250,
      zoom: 1,
    });
  });

  it("uses the same visible graph width as legacy ReactFlow when panes are open", () => {
    expect(
      resolveSettingsGraphSubstrateCanaryVisibleViewportSize(
        { width: 1000, height: 600 },
        320,
        180,
      ),
    ).toEqual({
      width: 500,
      height: 600,
    });
  });

  it("matches legacy toolbar center-point zoom once the d3-owned base viewport is supplied", () => {
    const nextViewport = resolveSettingsGraphSubstrateCanaryToolbarZoomViewport(
      {
        x: -265.613,
        y: -522.798,
        zoom: 0.988142,
      },
      {
        width: 1280,
        height: 648,
      },
      {
        minZoom: 0.1,
        maxZoom: 2,
        nextZoom: 0.988142 * 1.2,
      },
    );

    expect(nextViewport.x).toBeCloseTo(-446.736, 3);
    expect(nextViewport.y).toBeCloseTo(-692.158, 3);
    expect(nextViewport.zoom).toBeCloseTo(1.18577, 5);
  });

  it("matches legacy pan-on-scroll behavior for plain wheel input", () => {
    expect(
      resolveSettingsGraphSubstrateCanaryWheelOutcome(
        { x: 919.9, y: 38.3, zoom: 0.1 },
        { x: 240, y: 180 },
        {
          ctrlKey: false,
          deltaMode: 0,
          deltaX: 0,
          deltaY: -240,
          shiftKey: false,
        },
        {
          isMacOs: true,
          minZoom: 0.1,
          maxZoom: 2,
          panOnScroll: true,
          panOnScrollMode: PanOnScrollModeEnum.free,
          panOnScrollSpeed: 1,
          zoomActivationKeyPressed: false,
          zoomOnPinch: true,
          zoomOnScroll: true,
        },
      ),
    ).toEqual({
      kind: "pan-scroll",
      nextViewport: {
        x: 919.9,
        y: 278.3,
        zoom: 0.1,
      },
    });
  });

  it("still zooms around the pointer when the zoom activation key is pressed", () => {
    const outcome = resolveSettingsGraphSubstrateCanaryWheelOutcome(
      { x: 919.9, y: 38.3, zoom: 0.1 },
      { x: 240, y: 180 },
      {
        ctrlKey: false,
        deltaMode: 0,
        deltaX: 0,
        deltaY: -240,
        shiftKey: false,
      },
      {
        isMacOs: true,
        minZoom: 0.1,
        maxZoom: 2,
        panOnScroll: true,
        panOnScrollMode: PanOnScrollModeEnum.free,
        panOnScrollSpeed: 1,
        zoomActivationKeyPressed: true,
        zoomOnPinch: true,
        zoomOnScroll: false,
      },
    );

    expect(outcome?.kind).toBe("zoom");
    expect(outcome?.nextViewport.x).toBeCloseTo(1188.2862, 3);
    expect(outcome?.nextViewport.y).toBeCloseTo(-17.6352, 3);
    expect(outcome?.nextViewport.zoom).toBeCloseTo(0.139474, 5);
  });
});

function createSceneSnapshot({
  position = { x: 0, y: 0 },
  renderedPosition = position,
}: {
  position?: { x: number; y: number };
  renderedPosition?: { x: number; y: number };
}) {
  return {
    sceneBounds: null,
    sections: [
      {
        height: 120,
        position,
        positionAndSizeLocked: false,
        renderedPosition,
        resolvedSize: { width: 240, height: 120 },
        sectionId: "section-a",
        tempZIndex: 1,
        width: 240,
        zIndex: 1,
      },
    ],
    sectionsById: new Map(),
  };
}
