/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";

import { areRetainedContentTexturePageTextLikeSnapshotsReady } from "./retainedContentTexturePageTextLikeSnapshots";
import type { RetainedTexturePageDescriptor } from "./retainedTexturePages";

describe("areRetainedContentTexturePageTextLikeSnapshotsReady", () => {
  it("waits for the matching snapshot source key to be marked paint-ready", () => {
    const descriptor = pageDescriptor({
      sourceRectCss: { height: 64, width: 64, x: 0, y: 0 },
    });
    const element = document.createElement("div");
    element.dataset.gpuFlowRetainedTextLikeRowSnapshotSourceKey =
      "snapshot-key";

    expect(
      areRetainedContentTexturePageTextLikeSnapshotsReady({
        descriptor,
        elementBySourceId: new Map([["snapshot-a", element]]),
        surface: {
          textLikeSnapshots: [
            {
              rectCss: { height: 20, width: 40, x: 8, y: 10 },
              rowId: "row-a",
              sourceId: "snapshot-a",
              sourceKey: "snapshot-key",
            },
          ],
        },
      }),
    ).toBe(false);

    element.dataset.gpuFlowRetainedTextLikeRowSnapshotReadyKey = "snapshot-key";

    expect(
      areRetainedContentTexturePageTextLikeSnapshotsReady({
        descriptor,
        elementBySourceId: new Map([["snapshot-a", element]]),
        surface: {
          textLikeSnapshots: [
            {
              rectCss: { height: 20, width: 40, x: 8, y: 10 },
              rowId: "row-a",
              sourceId: "snapshot-a",
              sourceKey: "snapshot-key",
            },
          ],
        },
      }),
    ).toBe(true);
  });
});

function pageDescriptor(
  overrides: Partial<RetainedTexturePageDescriptor> = {},
): RetainedTexturePageDescriptor {
  return {
    contentVersion: 1,
    devicePixelRatioBucket: 1,
    lodLevel: 0,
    lodScale: 1,
    pixelHeight: 64,
    pixelWidth: 64,
    scaleKey: "scale=1",
    sourceKey: "source-key",
    sourceRectCss: { height: 64, width: 64, x: 0, y: 0 },
    sourceVersion: 1,
    sourceWindowCss: { height: 64, width: 64, x: 0, y: 0 },
    surfaceId: "surface-a",
    tileColumn: 0,
    tileRow: 0,
    viewportZoomBucket: 1,
    ...overrides,
  };
}
