/* @vitest-environment jsdom */

import { TEST_GPU_RETAINED_SINGLE_LINE_TEXT_POLICY } from "testUtils/gpuRetainedTextLikePolicy";
import { describe, expect, it } from "vitest";

import { createGpuFlowStartupCommittedSurfaceFrame } from "../committedSurfaceFrame";
import { createDomControlActors } from "../committedSurfaceTextActor";
import {
  createGpuRetainedRowContentScene,
  type GpuRetainedContentRowInput,
} from "../retainedContentScene";
import { createGpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import type { GpuFlowScene } from "../scene";
import { getGpuRetainedDomControlSnapshotSurfaceLayouts } from "./retainedDomControlSnapshotSources";
import {
  getGpuRetainedDomControlSnapshotSurfaceId,
  getGpuRetainedDomControlSources,
} from "./retainedDomControlSources";

describe("getGpuRetainedDomControlSources", () => {
  it("derives DOM-plane descriptors from retained row geometry", () => {
    const sources = getGpuRetainedDomControlSources(scene({ rowCount: 1 }));

    expect(sources).toEqual([
      expect.objectContaining({
        active: false,
        defaultValue: "",
        disabled: false,
        error: false,
        language: "python",
        layerSlot: "dom-control-plane",
        lifecycleState: "passive-projected",
        linePolicy: "single-line",
        rowId: "param-a",
        sectionId: "section-a",
        snapshotCacheKey: expect.objectContaining({
          appThemeRevision: "setta-app-theme:inherited",
          codeMirrorThemeRevision:
            "setta-codemirror-theme:use-code-mirror-style",
          cssStyleRevision: expect.any(String),
          devicePixelRatioBucket: 1,
          editorExtensionGeneration: "text|single-line|nowrap",
          fontGeneration: "document-fonts:runtime",
          measuredLayoutMode: "single-line",
          syntaxGeneration: "python",
          value: "alpha",
          zoomBucket: 1,
        }),
        sourceId: "retained-dom-control:surface-a:param-a",
        sourceRectCssPx: {
          height: 24,
          width: 80,
          x: 0,
          y: 0,
        },
        snapshotSurfaceId: null,
        surfaceId: "surface-a",
        value: "alpha",
        visualPolicy: "live-dom",
        visualSemantics: {
          accessibility: "visual-only-aria-hidden",
          focusable: false,
          pointer: "retained-activation-model",
          selectable: "none",
        },
        viewportRectCssPx: {
          height: 24,
          width: 80,
          x: 130,
          y: 20,
        },
        worldRectFlowPx: {
          height: 24,
          width: 80,
          x: 130,
          y: 20,
        },
        wrapLines: false,
      }),
    ]);
  });

  it("keeps row source keys independent from retained scroll offsets inside the same cache window", () => {
    const firstSource = getGpuRetainedDomControlSources(
      scene({ rowCount: 20, scrollY: 7 }),
    )[0];
    const nextSource = getGpuRetainedDomControlSources(
      scene({ rowCount: 20, scrollY: 15 }),
    )[0];

    expect(firstSource?.sourceKey).toBe(nextSource?.sourceKey);
    expect(firstSource?.sourceRectCssPx).toEqual(nextSource?.sourceRectCssPx);
  });

  it("marks active DOM-owned rows as active DOM-plane controls", () => {
    const source = getGpuRetainedDomControlSources(
      scene({ activeSecondRow: true, rowCount: 2 }),
    ).find((candidate) => candidate.rowId === "param-b");

    expect(source).toEqual(
      expect.objectContaining({
        active: true,
        layerSlot: "active-dom-control-plane",
        lifecycleState: "active-projected",
        viewportRectCssPx: {
          height: 24,
          width: 80,
          x: 130,
          y: 44,
        },
      }),
    );
  });

  it("projects DOM-plane descriptor geometry through the retained runtime viewport", () => {
    const runtimeFrame = createGpuRetainedRuntimeFrame({
      devicePixelRatioBucket: 2,
      frameId: 1,
      scene: scene({ activeSecondRow: true, rowCount: 2 }),
      scrollOffsets: new Map(),
      scrollRevision: 0,
      viewport: [5, 7, 2],
      viewportZoomBucket: 2,
    });
    const source = runtimeFrame.descriptors.domControlSources.find(
      (candidate) => candidate.rowId === "param-b",
    );

    expect(source?.viewportRectCssPx).toEqual({
      height: 48,
      width: 160,
      x: 265,
      y: 95,
    });
    expect(source?.snapshotCacheKey).toEqual(
      expect.objectContaining({
        devicePixelRatioBucket: 2,
        zoomBucket: 2,
      }),
    );
  });

  it("classifies excess visible passive rows as bounded browser snapshot actors", () => {
    const runtimeFrame = createGpuRetainedRuntimeFrame({
      devicePixelRatioBucket: 1,
      frameId: 2,
      scene: scene({ rowCount: 80, surfaceHeight: 80 * 24 }),
      scrollOffsets: new Map(),
      scrollRevision: 0,
      viewport: [0, 0, 1],
      viewportSize: { height: 2_200, width: 320 },
      viewportZoomBucket: 1,
    });
    const sources = runtimeFrame.descriptors.domControlSources;
    const liveSources = sources.filter(
      (source) => source.visualPolicy === "live-dom",
    );
    const snapshotSources = sources.filter(
      (source) => source.visualPolicy === "snapshot",
    );

    expect(liveSources.length).toBeGreaterThanOrEqual(24);
    expect(liveSources.length).toBeLessThanOrEqual(32);
    expect(snapshotSources.length).toBeGreaterThan(0);
    expect(liveSources.length + snapshotSources.length).toBe(80);
    expect(snapshotSources[0]).toEqual(
      expect.objectContaining({
        projectionVisibility: "viewport-visible",
        snapshotSurfaceId: getGpuRetainedDomControlSnapshotSurfaceId(
          snapshotSources[0]!,
        ),
      }),
    );

    const committedFrame = createGpuFlowStartupCommittedSurfaceFrame({
      retainedRuntimeFrame: runtimeFrame,
    });
    expect(committedFrame.projectionHorizon.textActorCoverage).toEqual(
      expect.objectContaining({
        exactLiveDomActorIds: expect.arrayContaining(
          liveSources.map((source) => source.sourceId),
        ),
        exactSnapshotActorIds: expect.arrayContaining(
          snapshotSources.map((source) => source.sourceId),
        ),
      }),
    );
    expect(committedFrame.diagnostics.textActorExactCoverageCount).toBe(80);

    expect(
      getGpuRetainedDomControlSnapshotSurfaceLayouts(snapshotSources)[0],
    ).toEqual(
      expect.objectContaining({
        actorKind: "dom-control",
        layer: "page",
        surfaceId: snapshotSources[0]?.snapshotSurfaceId,
        textureContentKey: snapshotSources[0]?.snapshotCacheKeyRevision,
      }),
    );
  });

  it("keeps visible text overflow blocked by browser visual readiness, not live-host readiness", () => {
    const runtimeFrame = createGpuRetainedRuntimeFrame({
      devicePixelRatioBucket: 1,
      frameId: 3,
      scene: scene({ rowCount: 120, surfaceHeight: 120 * 24 }),
      scrollOffsets: new Map(),
      scrollRevision: 0,
      viewport: [0, 0, 1],
      viewportSize: { height: 3_200, width: 320 },
      viewportZoomBucket: 1,
    });
    const blockedSource = runtimeFrame.descriptors.domControlSources.find(
      (source) => source.visualPolicy === "blocked-awaiting-browser-visual",
    );
    const blockedActor = createDomControlActors(runtimeFrame).find(
      (actor) => actor.actorId === blockedSource?.sourceId,
    );

    expect(blockedSource).toBeTruthy();
    expect(blockedActor?.textCoverageProof).toEqual(
      expect.objectContaining({
        projectionCoverage: "blocked-awaiting-browser-visual",
        readinessReason: "snapshot-pending",
      }),
    );
  });
});

function scene({
  activeSecondRow = false,
  firstValue = "alpha",
  rowCount = 2,
  scrollY = 0,
  surfaceHeight = 48,
}: {
  readonly activeSecondRow?: boolean | undefined;
  readonly firstValue?: string | undefined;
  readonly rowCount?: number | undefined;
  readonly scrollY?: number | undefined;
  readonly surfaceHeight?: number | undefined;
} = {}): GpuFlowScene {
  const retainedScene = createGpuRetainedRowContentScene({
    controlWidth: 80,
    id: "surface-a",
    ownerSectionId: "section-a",
    rowHeight: 24,
    rows: Array.from({ length: rowCount }, (_, index) =>
      row(
        `param-${String.fromCharCode(97 + index)}`,
        index === 0 ? firstValue : `value-${index}`,
        activeSecondRow && index === 1,
      ),
    ),
    scrollOffset: { x: 0, y: scrollY },
    viewportRect: { height: surfaceHeight, width: 200, x: 0, y: 0 },
  });
  return {
    contentSurfaces: [
      {
        clipRect: { height: surfaceHeight, width: 200, x: 0, y: 0 },
        id: "surface-a",
        ownerSectionId: "section-a",
        rect: { height: surfaceHeight, width: 200, x: 10, y: 20 },
        renderer: { kind: "canvas-content", surfaceId: "surface-a" },
        retainedScene,
        zIndex: 7,
      },
    ],
    domIslands: [],
    edges: [],
    revision: 1,
    sections: [],
  };
}

function row(
  id: string,
  displayValue: string,
  nativeControlActive = false,
): GpuRetainedContentRowInput {
  return {
    control: {
      commitPolicy: "native-island" as const,
      defaultDisplayValue: "",
      displayValue,
      editorKind: "text" as const,
      kind: "text-like" as const,
      policy: TEST_GPU_RETAINED_SINGLE_LINE_TEXT_POLICY,
      renderOwner: "dom-owned",
      rendererFamily: "text-like",
    },
    controlKind: "text-like",
    depth: 0,
    id,
    label: id,
    state: nativeControlActive ? { nativeControlActive: true } : {},
  };
}
