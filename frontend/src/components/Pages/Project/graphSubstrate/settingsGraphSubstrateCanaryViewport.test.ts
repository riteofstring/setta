import { describe, expect, it } from "vitest";
import {
  resolveSettingsGraphSubstrateCanaryViewport,
  shouldAutoFitSettingsGraphSubstrateCanaryViewport,
} from "./settingsGraphSubstrateCanaryViewport";

describe("settingsGraphSubstrateCanaryViewport", () => {
  it("prefers the live canary viewport over any shared saved viewport", () => {
    expect(
      resolveSettingsGraphSubstrateCanaryViewport(
        { x: 12, y: -24, zoom: 0.8 },
        { x: 100, y: 200, zoom: 0.2 },
        1,
        { x: 400, y: 300 },
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
        1,
        { x: 400, y: 300 },
      ),
    ).toEqual({
      x: 320,
      y: -180,
      zoom: 0.42,
    });
  });

  it("uses the top-left fallback only when no authoritative viewport exists", () => {
    expect(
      resolveSettingsGraphSubstrateCanaryViewport(
        null,
        null,
        0.75,
        { x: 160, y: 80 },
      ),
    ).toEqual({
      x: -72,
      y: -12,
      zoom: 0.75,
    });
    expect(
      shouldAutoFitSettingsGraphSubstrateCanaryViewport(null, null),
    ).toBe(true);
    expect(
      shouldAutoFitSettingsGraphSubstrateCanaryViewport(
        { x: 0, y: 0, zoom: 1 },
        null,
      ),
    ).toBe(false);
    expect(
      shouldAutoFitSettingsGraphSubstrateCanaryViewport(
        null,
        { x: 40, y: -20, zoom: 0.5 },
      ),
    ).toBe(false);
  });
});
