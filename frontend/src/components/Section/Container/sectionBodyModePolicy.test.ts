import { describe, expect, it } from "vitest";
import {
  getAutoSectionBodyRequestedMode,
  getProjectedNodeSizePx,
  isAutoSectionBodyPreviewCandidate,
  SECTION_BODY_AUTO_MODE_THRESHOLDS,
} from "./sectionBodyModePolicy";

describe("sectionBodyModePolicy", () => {
  it("marks inactive dense canvas sections as preview during motion when they are small on screen", () => {
    expect(
      getAutoSectionBodyRequestedMode({
        ownerKind: "canvas",
        family: "tier1-dense-params",
        isActiveSection: false,
        viewportInteractionActive: true,
        previewLocalityEligible: true,
        zoom: 0.7,
        projectedWidthPx:
          SECTION_BODY_AUTO_MODE_THRESHOLDS.previewMaxProjectedWidthPx - 1,
        projectedHeightPx:
          SECTION_BODY_AUTO_MODE_THRESHOLDS.previewMaxProjectedHeightPx - 1,
      }),
    ).toBe("preview");
  });

  it("keeps active sections live even when they would otherwise be preview eligible", () => {
    expect(
      getAutoSectionBodyRequestedMode({
        ownerKind: "canvas",
        family: "tier1-dense-params",
        isActiveSection: true,
        viewportInteractionActive: true,
        previewLocalityEligible: true,
        zoom: 0.6,
        projectedWidthPx: 120,
        projectedHeightPx: 90,
      }),
    ).toBe("live");
  });

  it("keeps sparse local and window-owned sections on the live path", () => {
    expect(
      getAutoSectionBodyRequestedMode({
        ownerKind: "canvas",
        family: "sparse-local",
        isActiveSection: false,
        viewportInteractionActive: true,
        previewLocalityEligible: true,
        zoom: 0.5,
        projectedWidthPx: 120,
        projectedHeightPx: 90,
      }),
    ).toBe("live");

    expect(
      getAutoSectionBodyRequestedMode({
        ownerKind: "window",
        family: "tier1-dense-params",
        isActiveSection: false,
        viewportInteractionActive: true,
        previewLocalityEligible: true,
        zoom: 0.5,
        projectedWidthPx: 120,
        projectedHeightPx: 90,
      }),
    ).toBe("live");
  });

  it("falls back to zoom when measured size is unavailable", () => {
    expect(
      getAutoSectionBodyRequestedMode({
        ownerKind: "canvas",
        family: "tier1-dense-params",
        isActiveSection: false,
        viewportInteractionActive: true,
        previewLocalityEligible: true,
        zoom: SECTION_BODY_AUTO_MODE_THRESHOLDS.previewFallbackMaxZoomWithoutMeasuredSize,
        projectedWidthPx: null,
        projectedHeightPx: null,
      }),
    ).toBe("preview");
  });

  it("keeps tier 2 code sections live in the first preview rollout", () => {
    expect(
      getAutoSectionBodyRequestedMode({
        ownerKind: "canvas",
        family: "tier2-code",
        isActiveSection: false,
        viewportInteractionActive: true,
        previewLocalityEligible: true,
        zoom: 0.6,
        projectedWidthPx: 140,
        projectedHeightPx: 90,
      }),
    ).toBe("live");
  });

  it("projects node size using current zoom", () => {
    expect(getProjectedNodeSizePx(200, 100, 0.5)).toEqual({
      projectedWidthPx: 100,
      projectedHeightPx: 50,
    });
    expect(getProjectedNodeSizePx(null, null, 0.5)).toEqual({
      projectedWidthPx: null,
      projectedHeightPx: null,
    });
  });

  it("keeps otherwise eligible preview candidates live when locality excludes them", () => {
    expect(
      getAutoSectionBodyRequestedMode({
        ownerKind: "canvas",
        family: "tier1-dense-params",
        isActiveSection: false,
        viewportInteractionActive: true,
        previewLocalityEligible: false,
        zoom: 0.6,
        projectedWidthPx: 120,
        projectedHeightPx: 90,
      }),
    ).toBe("live");
  });

  it("exposes the preview candidate predicate for separate locality decisions", () => {
    expect(
      isAutoSectionBodyPreviewCandidate({
        ownerKind: "canvas",
        family: "tier1-dense-params",
        isActiveSection: false,
        zoom: 0.6,
        projectedWidthPx: 120,
        projectedHeightPx: 90,
      }),
    ).toBe(true);
  });
});
