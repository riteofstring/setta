/* @vitest-environment jsdom */

import { afterEach, describe, expect, it } from "vitest";

import type { CommittedHtmlSurfaceTextureSnapshot } from "../htmlSurfaces/textures";
import { createGpuFlowViewportStore } from "../viewportStore";
import { createGpuFlowBrowserVisualActorRuntime } from "./browserVisualActorRuntime";
import {
  committedSnapshotTexture,
  createMockViewportRuntime,
  domControl,
  domControlCoverageState,
  domControlReadinessResourceHandles,
  retainedDisplayFrame,
  retainedRuntimeFrame,
  stageBrowserVisualCandidate,
} from "./domControlPlaneProjectionRuntimeTestUtils";
import { getGpuRetainedDomControlSnapshotSurfaceId } from "./retainedDomControlSources";

describe("GPU flow DOM control projection runtime snapshots", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("requires captured snapshot texture content before reporting exact snapshot readiness", () => {
    const control = domControl({
      index: 79,
      snapshotSurfaceId: "snapshot-0",
      value: "snapshot value",
      visualPolicy: "snapshot",
    });
    const runtimeFrame = retainedRuntimeFrame([
      ...Array.from({ length: 79 }, (_, index) => domControl({ index })),
      control,
    ]);
    const browserVisualRuntime = createGpuFlowBrowserVisualActorRuntime();
    const viewportRuntime = createMockViewportRuntime([0, 0, 1]);
    const viewportStore = createGpuFlowViewportStore({
      height: 60,
      transform: [0, 0, 1],
      width: 400,
    });
    browserVisualRuntime.setDomControlProjectionEnvironment({
      getRetainedScrollOffset: undefined,
      viewportRuntime,
      viewportStore,
    });
    let committedTexture: CommittedHtmlSurfaceTextureSnapshot | undefined;
    browserVisualRuntime.setDomControlSnapshotTextureManager({
      getCommittedSurfaceTexture: (surfaceId) =>
        surfaceId === "snapshot-0" ? committedTexture : undefined,
    });

    const firstReadiness = browserVisualRuntime.prepareCommittedSurfaceFrame({
      retainedDisplayFrame: retainedDisplayFrame({
        id: 1,
        retainedRuntimeFrame: runtimeFrame,
      }),
    });
    expect(domControlCoverageState(firstReadiness, control)).toBe(
      "blocked-awaiting-snapshot",
    );
    stageBrowserVisualCandidate({
      actorId: control.sourceId,
      browserVisualRuntime,
      candidate: firstReadiness,
    });
    expect(
      browserVisualRuntime
        .getPreparationSnapshot()
        .domControls.snapshotControls.map(
          (snapshotControl) => snapshotControl.sourceId,
        ),
    ).toContain(control.sourceId);

    const element = document.body.appendChild(document.createElement("div"));
    browserVisualRuntime.setDomControlSnapshotElement({
      element,
      surfaceId: "snapshot-0",
    });
    const missingTextureReadiness =
      browserVisualRuntime.prepareCommittedSurfaceFrame({
        retainedDisplayFrame: retainedDisplayFrame({
          id: 2,
          retainedRuntimeFrame: runtimeFrame,
        }),
      });
    expect(domControlCoverageState(missingTextureReadiness, control)).toBe(
      "blocked-awaiting-snapshot",
    );

    committedTexture = committedSnapshotTexture({
      dirtyContent: true,
      textureContentKey: control.snapshotCacheKeyRevision,
    });
    const dirtyReadiness = browserVisualRuntime.prepareCommittedSurfaceFrame({
      retainedDisplayFrame: retainedDisplayFrame({
        id: 3,
        retainedRuntimeFrame: runtimeFrame,
      }),
    });
    expect(domControlCoverageState(dirtyReadiness, control)).toBe(
      "blocked-awaiting-snapshot",
    );

    committedTexture = committedSnapshotTexture({
      dirtyResolution: true,
      textureContentKey: control.snapshotCacheKeyRevision,
    });
    const dirtyResolutionReadiness =
      browserVisualRuntime.prepareCommittedSurfaceFrame({
        retainedDisplayFrame: retainedDisplayFrame({
          id: 4,
          retainedRuntimeFrame: runtimeFrame,
        }),
      });
    expect(domControlCoverageState(dirtyResolutionReadiness, control)).toBe(
      "blocked-awaiting-snapshot",
    );

    committedTexture = committedSnapshotTexture({
      textureContentKey: "stale-cache-key",
    });
    const staleReadiness = browserVisualRuntime.prepareCommittedSurfaceFrame({
      retainedDisplayFrame: retainedDisplayFrame({
        id: 5,
        retainedRuntimeFrame: runtimeFrame,
      }),
    });
    expect(domControlCoverageState(staleReadiness, control)).toBe(
      "blocked-awaiting-snapshot",
    );

    committedTexture = committedSnapshotTexture({
      lastUploadFrame: 2,
      textureContentKey: control.snapshotCacheKeyRevision,
    });
    const readyReadiness = browserVisualRuntime.prepareCommittedSurfaceFrame({
      retainedDisplayFrame: retainedDisplayFrame({
        id: 6,
        retainedRuntimeFrame: runtimeFrame,
      }),
    });
    expect(domControlCoverageState(readyReadiness, control)).toBe(
      "exact-snapshot-ready",
    );
    expect(domControlReadinessResourceHandles(readyReadiness, control)).toEqual(
      [
        expect.objectContaining({
          actorId: control.sourceId,
          contentGenerationId: control.snapshotCacheKeyRevision,
          id: "snapshot-0",
          kind: "texture",
          projectionGenerationId: expect.any(String),
          resourceGenerationId: expect.any(String),
        }),
      ],
    );
  });

  it("keeps snapshot preparation staging batched by the browser visual runtime", () => {
    const snapshotControls = Array.from({ length: 26 }, (_, offset) =>
      domControl({
        index: 70 + offset,
        snapshotSurfaceId: `snapshot-${offset}`,
        value: `snapshot value ${offset}`,
        visualPolicy: "snapshot",
      }),
    );
    const runtimeFrame = retainedRuntimeFrame([
      ...Array.from({ length: 70 }, (_, index) => domControl({ index })),
      ...snapshotControls,
    ]);
    const browserVisualRuntime = createGpuFlowBrowserVisualActorRuntime();
    const viewportRuntime = createMockViewportRuntime([0, 0, 1]);
    const viewportStore = createGpuFlowViewportStore({
      height: 60,
      transform: [0, 0, 1],
      width: 400,
    });
    const committedTextureBySurfaceId = new Map<
      string,
      CommittedHtmlSurfaceTextureSnapshot
    >();
    browserVisualRuntime.setDomControlProjectionEnvironment({
      getRetainedScrollOffset: undefined,
      viewportRuntime,
      viewportStore,
    });
    browserVisualRuntime.setDomControlSnapshotTextureManager({
      getCommittedSurfaceTexture: (surfaceId) =>
        committedTextureBySurfaceId.get(surfaceId),
    });

    const firstReadiness = browserVisualRuntime.prepareCommittedSurfaceFrame({
      retainedDisplayFrame: retainedDisplayFrame({
        id: 1,
        retainedRuntimeFrame: runtimeFrame,
      }),
    });
    stageBrowserVisualCandidate({
      browserVisualRuntime,
      candidate: firstReadiness,
    });
    const stagedSnapshotControlIds = browserVisualRuntime
      .getPreparationSnapshot()
      .domControls.snapshotControls.map((control) => control.sourceId);
    expect(stagedSnapshotControlIds.length).toBeLessThanOrEqual(4);
    expect(
      stagedSnapshotControlIds.every((sourceId) =>
        snapshotControls.some((control) => control.sourceId === sourceId),
      ),
    ).toBe(true);
    expect(stagedSnapshotControlIds.length).toBeGreaterThan(0);

    const targetedControl = snapshotControls[10];
    if (!targetedControl) {
      throw new Error("Expected a targeted snapshot control.");
    }
    const targetedReadiness = browserVisualRuntime.prepareCommittedSurfaceFrame(
      {
        retainedDisplayFrame: retainedDisplayFrame({
          id: 2,
          retainedRuntimeFrame: runtimeFrame,
        }),
      },
    );
    stageBrowserVisualCandidate({
      actorId: targetedControl.sourceId,
      browserVisualRuntime,
      candidate: targetedReadiness,
      sampleId: 2,
    });
    expect(
      browserVisualRuntime
        .getPreparationSnapshot()
        .domControls.snapshotControls.map((control) => control.sourceId),
    ).toEqual(expect.arrayContaining([targetedControl.sourceId]));

    for (const control of snapshotControls) {
      const surfaceId = control.snapshotSurfaceId;
      if (!surfaceId) {
        throw new Error("Expected snapshot surface id.");
      }
      const element = document.body.appendChild(document.createElement("div"));
      browserVisualRuntime.setDomControlSnapshotElement({
        element,
        surfaceId,
      });
      committedTextureBySurfaceId.set(
        surfaceId,
        committedSnapshotTexture({
          textureContentKey: control.snapshotCacheKeyRevision,
        }),
      );
    }
    const nextReadiness = browserVisualRuntime.prepareCommittedSurfaceFrame({
      retainedDisplayFrame: retainedDisplayFrame({
        id: 3,
        retainedRuntimeFrame: runtimeFrame,
      }),
    });
    for (const control of snapshotControls) {
      expect(domControlCoverageState(nextReadiness, control)).toBe(
        "exact-snapshot-ready",
      );
    }
  });

  it("falls back to exact snapshots for visible live DOM controls beyond the live-host budget", () => {
    const controls = Array.from({ length: 80 }, (_, index) =>
      domControl({ index, value: `value ${index}` }),
    );
    const runtimeFrame = retainedRuntimeFrame(controls);
    const browserVisualRuntime = createGpuFlowBrowserVisualActorRuntime();
    const viewportRuntime = createMockViewportRuntime([0, 0, 1]);
    const viewportStore = createGpuFlowViewportStore({
      height: 3_000,
      transform: [0, 0, 1],
      width: 400,
    });
    const committedTextureBySurfaceId = new Map<
      string,
      CommittedHtmlSurfaceTextureSnapshot
    >();
    browserVisualRuntime.setDomControlProjectionEnvironment({
      getRetainedScrollOffset: undefined,
      viewportRuntime,
      viewportStore,
    });
    browserVisualRuntime.setDomControlSnapshotTextureManager({
      getCommittedSurfaceTexture: (surfaceId) =>
        committedTextureBySurfaceId.get(surfaceId),
    });

    const firstReadiness = browserVisualRuntime.prepareCommittedSurfaceFrame({
      retainedDisplayFrame: retainedDisplayFrame({
        id: 1,
        retainedRuntimeFrame: runtimeFrame,
      }),
    });
    stageBrowserVisualCandidate({
      browserVisualRuntime,
      candidate: firstReadiness,
    });

    const overflowControl = browserVisualRuntime
      .getPreparationSnapshot()
      .domControls.snapshotControls.find(
        (control) => control.visualPolicy === "live-dom",
      );
    if (!overflowControl) {
      throw new Error("Expected a live DOM-control overflow snapshot.");
    }
    const overflowSnapshotSurfaceId =
      getGpuRetainedDomControlSnapshotSurfaceId(overflowControl);
    expect(domControlCoverageState(firstReadiness, overflowControl)).toBe(
      "blocked-awaiting-snapshot",
    );

    const element = document.body.appendChild(document.createElement("div"));
    browserVisualRuntime.setDomControlSnapshotElement({
      element,
      surfaceId: overflowSnapshotSurfaceId,
    });
    committedTextureBySurfaceId.set(
      overflowSnapshotSurfaceId,
      committedSnapshotTexture({
        textureContentKey: overflowControl.snapshotCacheKeyRevision,
      }),
    );

    const readyReadiness = browserVisualRuntime.prepareCommittedSurfaceFrame({
      retainedDisplayFrame: retainedDisplayFrame({
        id: 2,
        retainedRuntimeFrame: runtimeFrame,
      }),
    });

    expect(domControlCoverageState(readyReadiness, overflowControl)).toBe(
      "exact-snapshot-ready",
    );
    expect(
      domControlReadinessResourceHandles(readyReadiness, overflowControl),
    ).toEqual([
      expect.objectContaining({
        actorId: overflowControl.sourceId,
        contentGenerationId: overflowControl.snapshotCacheKeyRevision,
        id: overflowSnapshotSurfaceId,
        kind: "texture",
        projectionGenerationId: expect.any(String),
        resourceGenerationId: expect.any(String),
      }),
    ]);
  });
});
