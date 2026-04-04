import { describe, expect, it } from "vitest";
import {
  fitSettingsGraphSubstrateCanaryViewport,
  resolveSettingsGraphSubstrateCanaryFallbackViewport,
  resolveSettingsGraphSubstrateCanarySharedViewport,
  resolveSettingsGraphSubstrateCanaryViewport,
  resolveSettingsGraphSubstrateCanaryVisibleViewportSize,
  shouldAutoFitSettingsGraphSubstrateCanaryViewport,
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
      resolveSettingsGraphSubstrateCanaryFallbackViewport(0.75, {
        x: 160,
        y: 80,
      });
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
      resolveSettingsGraphSubstrateCanaryFallbackViewport(1, { x: 0, y: 0 });
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
      resolveSettingsGraphSubstrateCanaryFallbackViewport(1, { x: 0, y: 0 });
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
});
