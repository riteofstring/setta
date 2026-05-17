/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, describe, expect, it } from "vitest";

import type {
  GpuFlowCommittedSurfaceBrowserVisualReadiness,
  GpuFlowCommittedSurfaceFrame,
} from "../committedSurfaceFrame";
import { createGpuFlowCommittedSurfaceRuntime } from "../committedSurfaceRuntime";
import type { CommittedHtmlSurfaceTextureSnapshot } from "../htmlSurfaces/textures";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import {
  GPU_RETAINED_TEXT_LIKE_INTERACTION_POLICY,
  type GpuRetainedDomControlSourceDescriptor,
} from "../retainedDomControlScene";
import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import {
  normalizeGpuViewport,
  type GpuViewportInput,
  type GpuViewportTuple,
} from "../viewportMath";
import type { GpuFlowViewportRuntime } from "../viewportRuntime";
import { createGpuFlowViewportStore } from "../viewportStore";
import {
  createGpuFlowBrowserVisualActorRuntime,
  getGpuFlowBrowserVisualActorRuntimeForCommittedSurface,
} from "./browserVisualActorRuntime";
import { GpuFlowDomControlPlane } from "./domControlPlane";
import { getGpuRetainedDomControlSnapshotSurfaceId } from "./retainedDomControlSources";

let root: Root | null = null;

describe("GPU flow DOM control projection runtime", () => {
  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
      root = null;
    }
    delete (window as Window & { __SETTA_CHROME_REPRO_ACTIVE__?: boolean })
      .__SETTA_CHROME_REPRO_ACTIVE__;
    document.body.replaceChildren();
  });

  it("projects mounted hosts on viewport motion without React mount selection", () => {
    const controls = [
      domControl({ active: true, index: 0 }),
      ...Array.from({ length: 99 }, (_, index) =>
        domControl({ index: index + 1 }),
      ),
    ];
    const viewportRuntime = createMockViewportRuntime([0, 0, 1]);
    const viewportStore = createGpuFlowViewportStore({
      height: 60,
      transform: [0, 0, 1],
      width: 400,
    });
    const host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);

    act(() => {
      root?.render(
        <GpuFlowDomControlPlane
          committedFrameId={1}
          getRetainedScrollOffset={undefined}
          onActivate={undefined}
          renderControl={(control) => (
            <input data-row-id={control.rowId} readOnly value={control.value} />
          )}
          retainedRuntimeFrame={retainedRuntimeFrame(controls)}
          viewportRuntime={viewportRuntime}
          viewportStore={viewportStore}
        />,
      );
    });
    const mountedBefore = mountedRowIds();

    act(() => {
      viewportRuntime.applyOverlayTransforms([0, -280, 1]);
    });

    expect(mountedBefore.length).toBeGreaterThan(0);
    expect(mountedRowIds()).toEqual(mountedBefore);
  });

  it("projects retained scroll motion without refreshing runtime host assignments", () => {
    const controls = Array.from({ length: 100 }, (_, index) =>
      domControl({ index }),
    );
    const browserVisualRuntime = createGpuFlowBrowserVisualActorRuntime();
    const viewportRuntime = createMockViewportRuntime([0, 0, 1]);
    const viewportStore = createGpuFlowViewportStore({
      height: 60,
      transform: [0, 0, 1],
      width: 400,
    });
    let retainedScrollY = 0;
    browserVisualRuntime.setDomControlProjectionEnvironment({
      getRetainedScrollOffset: () => ({ x: 0, y: retainedScrollY }),
      viewportRuntime,
      viewportStore,
    });
    browserVisualRuntime.prepareCommittedSurfaceFrame({
      retainedDisplayFrame: retainedDisplayFrame({
        id: 1,
        retainedRuntimeFrame: retainedRuntimeFrame(controls),
      }),
    });
    const mountedBefore = browserVisualRuntime
      .getSnapshot()
      .domControls.mountedControls.map((control) => control.rowId);

    retainedScrollY = 280;
    browserVisualRuntime.projectDomControls();

    expect(
      browserVisualRuntime
        .getSnapshot()
        .domControls.mountedControls.map((control) => control.rowId),
    ).toEqual(mountedBefore);
  });

  it("pins focused DOM-control hosts while retained active state catches up", () => {
    const activeControls = [
      domControl({ active: true, index: 0 }),
      ...Array.from({ length: 99 }, (_, index) =>
        domControl({ index: index + 1 }),
      ),
    ];
    const passiveControls = [
      domControl({ active: false, index: 0 }),
      ...Array.from({ length: 99 }, (_, index) =>
        domControl({ index: index + 1 }),
      ),
    ];
    const viewportRuntime = createMockViewportRuntime([0, 0, 1]);
    const viewportStore = createGpuFlowViewportStore({
      height: 60,
      transform: [0, 0, 1],
      width: 400,
    });
    const host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);

    const renderPlane = (
      controls: readonly GpuRetainedDomControlSourceDescriptor[],
    ) => (
      <GpuFlowDomControlPlane
        committedFrameId={1}
        getRetainedScrollOffset={undefined}
        onActivate={undefined}
        renderControl={(control) => (
          <input
            data-active={control.active ? "true" : "false"}
            data-row-id={control.rowId}
            readOnly
            value={control.value}
          />
        )}
        retainedRuntimeFrame={retainedRuntimeFrame(controls)}
        viewportRuntime={viewportRuntime}
        viewportStore={viewportStore}
      />
    );

    act(() => {
      root?.render(renderPlane(activeControls));
    });
    const input = document.querySelector<HTMLInputElement>(
      "input[data-row-id='row-0']",
    );
    if (!input) {
      throw new Error("Expected row-0 DOM control input to mount.");
    }
    act(() => {
      input.focus();
    });

    act(() => {
      root?.render(renderPlane(passiveControls));
    });

    const rowHost = document.querySelector<HTMLElement>(
      "[data-gpu-flow-dom-control-row-id='row-0']",
    );
    expect(document.activeElement).toBe(input);
    expect(rowHost?.dataset.gpuFlowDomControlActive).toBe("true");

    act(() => {
      viewportRuntime.applyOverlayTransforms([0, -280, 1]);
    });

    expect(rowHost?.style.display).not.toBe("none");
  });

  it("keeps focused DOM-control hosts focused across frame metadata updates", () => {
    const controls = [
      domControl({ active: true, index: 0 }),
      ...Array.from({ length: 99 }, (_, index) =>
        domControl({ index: index + 1 }),
      ),
    ];
    const runtimeFrame = retainedRuntimeFrame(controls);
    const viewportRuntime = createMockViewportRuntime([0, 0, 1]);
    const viewportStore = createGpuFlowViewportStore({
      height: 60,
      transform: [0, 0, 1],
      width: 400,
    });
    const host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);

    const renderPlane = (committedFrameId: number) => (
      <GpuFlowDomControlPlane
        committedFrameId={committedFrameId}
        getRetainedScrollOffset={undefined}
        onActivate={undefined}
        renderControl={(control) => (
          <input data-row-id={control.rowId} readOnly value={control.value} />
        )}
        retainedRuntimeFrame={runtimeFrame}
        viewportRuntime={viewportRuntime}
        viewportStore={viewportStore}
      />
    );

    act(() => {
      root?.render(renderPlane(1));
    });
    const input = document.querySelector<HTMLInputElement>(
      "input[data-row-id='row-0']",
    );
    if (!input) {
      throw new Error("Expected row-0 DOM control input to mount.");
    }
    act(() => {
      input.focus();
    });

    act(() => {
      root?.render(renderPlane(2));
    });

    expect(document.activeElement).toBe(input);
  });

  it("focuses CodeMirror content for active retained DOM-control hosts", () => {
    const controls = [
      domControl({ active: true, index: 0 }),
      ...Array.from({ length: 99 }, (_, index) =>
        domControl({ index: index + 1 }),
      ),
    ];
    const viewportRuntime = createMockViewportRuntime([0, 0, 1]);
    const viewportStore = createGpuFlowViewportStore({
      height: 60,
      transform: [0, 0, 1],
      width: 400,
    });
    const host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);

    act(() => {
      root?.render(
        <GpuFlowDomControlPlane
          committedFrameId={1}
          getRetainedScrollOffset={undefined}
          onActivate={undefined}
          renderControl={(control) => (
            <div data-gpu-flow-control={`codemirror:${control.rowId}:value`}>
              <div
                className="cm-content"
                contentEditable
                data-row-id={control.rowId}
                suppressContentEditableWarning
                tabIndex={0}
              />
            </div>
          )}
          retainedRuntimeFrame={retainedRuntimeFrame(controls)}
          viewportRuntime={viewportRuntime}
          viewportStore={viewportStore}
        />,
      );
    });

    expect(document.activeElement).toBe(
      document.querySelector("[data-row-id='row-0']"),
    );
  });

  it("uses identical DOM-control host selection when Chrome repro capture is active", () => {
    const controls = Array.from({ length: 100 }, (_, index) =>
      domControl({ index }),
    );
    const normalMounted = renderMountedRowIds({
      controls,
      chromeReproActive: false,
    });

    if (root) {
      act(() => root?.unmount());
      root = null;
    }
    document.body.replaceChildren();

    const recorderMounted = renderMountedRowIds({
      controls,
      chromeReproActive: true,
    });

    expect(recorderMounted.length).toBeGreaterThan(0);
    expect(recorderMounted).toEqual(normalMounted);
  });

  it("tracks committed-frame store updates when React semantic rendering dedupes", () => {
    const firstControls = [domControl({ index: 0 })];
    const nextControls = [domControl({ index: 1 })];
    const firstRuntimeFrame = retainedRuntimeFrame(firstControls, 1);
    const nextRuntimeFrame = retainedRuntimeFrame(nextControls, 2);
    const committedSurfaceRuntime = createGpuFlowCommittedSurfaceRuntime(
      committedSurfaceFrame({
        displayFrameId: 1,
        retainedRuntimeFrame: firstRuntimeFrame,
      }),
    );
    const viewportRuntime = createMockViewportRuntime([0, 0, 1]);
    const viewportStore = createGpuFlowViewportStore({
      height: 60,
      transform: [0, 0, 1],
      width: 400,
    });
    const host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);

    act(() => {
      root?.render(
        <GpuFlowDomControlPlane
          committedFrameId={1}
          committedSurfaceRuntime={committedSurfaceRuntime}
          getRetainedScrollOffset={undefined}
          onActivate={undefined}
          renderControl={(control) => (
            <input data-row-id={control.rowId} readOnly value={control.value} />
          )}
          retainedRuntimeFrame={firstRuntimeFrame}
          viewportRuntime={viewportRuntime}
          viewportStore={viewportStore}
        />,
      );
    });
    expect(mountedRowIds()).toEqual(["row-0"]);

    act(() => {
      committedSurfaceRuntime.publishCommittedContentFrame(
        committedSurfaceFrame({
          displayFrameId: 2,
          retainedRuntimeFrame: nextRuntimeFrame,
        }),
      );
    });

    expect(mountedRowIds()).toEqual(["row-1"]);
    expect(
      document.querySelector<HTMLElement>(
        "[data-gpu-flow-dom-control-plane='true']",
      )?.dataset.gpuFlowDomControlPlaneCommittedFrameId,
    ).toBe("2");
  });

  it("prepares candidate hosts offscreen before reporting live-host readiness", () => {
    const firstRuntimeFrame = retainedRuntimeFrame([domControl({ index: 0 })]);
    const nextRuntimeFrame = retainedRuntimeFrame(
      [domControl({ index: 1 })],
      2,
    );
    const committedSurfaceRuntime = createGpuFlowCommittedSurfaceRuntime(
      committedSurfaceFrame({
        displayFrameId: 1,
        retainedRuntimeFrame: firstRuntimeFrame,
      }),
    );
    const browserVisualRuntime =
      getGpuFlowBrowserVisualActorRuntimeForCommittedSurface(
        committedSurfaceRuntime,
      );
    const viewportRuntime = createMockViewportRuntime([0, 0, 1]);
    const viewportStore = createGpuFlowViewportStore({
      height: 60,
      transform: [0, 0, 1],
      width: 400,
    });
    const host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);

    act(() => {
      root?.render(
        <GpuFlowDomControlPlane
          committedFrameId={1}
          committedSurfaceRuntime={committedSurfaceRuntime}
          getRetainedScrollOffset={undefined}
          onActivate={undefined}
          renderControl={(control) => (
            <input data-row-id={control.rowId} readOnly value={control.value} />
          )}
          retainedRuntimeFrame={firstRuntimeFrame}
          viewportRuntime={viewportRuntime}
          viewportStore={viewportStore}
        />,
      );
    });

    const firstReadiness = browserVisualRuntime.prepareCommittedSurfaceFrame({
      retainedDisplayFrame: retainedDisplayFrame({
        id: 1,
        retainedRuntimeFrame: firstRuntimeFrame,
      }),
    });
    expect(
      firstReadiness.domControlReadinessByActorId.get("source-0")
        ?.coverageState,
    ).toBe("live-host-ready");

    let blockedReadiness:
      | GpuFlowCommittedSurfaceBrowserVisualReadiness
      | undefined;
    act(() => {
      blockedReadiness = browserVisualRuntime.prepareCommittedSurfaceFrame({
        retainedDisplayFrame: retainedDisplayFrame({
          id: 2,
          retainedRuntimeFrame: nextRuntimeFrame,
        }),
      });
    });
    expect(
      blockedReadiness!.domControlReadinessByActorId.get("source-1")
        ?.coverageState,
    ).toBe("blocked-awaiting-live-host");

    let readyReadiness:
      | GpuFlowCommittedSurfaceBrowserVisualReadiness
      | undefined;
    act(() => {
      readyReadiness = browserVisualRuntime.prepareCommittedSurfaceFrame({
        retainedDisplayFrame: retainedDisplayFrame({
          id: 2,
          retainedRuntimeFrame: nextRuntimeFrame,
        }),
      });
    });

    expect(mountedRowIds()).toContain("row-1");
    expect(
      readyReadiness!.domControlReadinessByActorId.get("source-1")
        ?.coverageState,
    ).toBe("live-host-ready");
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
    expect(
      browserVisualRuntime
        .getSnapshot()
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
    expect(
      readyReadiness.domControlReadinessByActorId.get(control.sourceId)
        ?.resourceHandles,
    ).toEqual([{ id: "snapshot-0", kind: "texture" }]);
  });

  it("keeps snapshot preparation batch ownership in the browser visual runtime", () => {
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

    browserVisualRuntime.prepareCommittedSurfaceFrame({
      retainedDisplayFrame: retainedDisplayFrame({
        id: 1,
        retainedRuntimeFrame: runtimeFrame,
      }),
    });
    expect(
      browserVisualRuntime
        .getSnapshot()
        .domControls.snapshotControls.map((control) => control.sourceId),
    ).toEqual(
      Array.from({ length: 8 }, (_, offset) => `source-${70 + offset}`),
    );

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
        id: 2,
        retainedRuntimeFrame: runtimeFrame,
      }),
    });

    expect(
      browserVisualRuntime
        .getSnapshot()
        .domControls.snapshotControls.map((control) => control.sourceId),
    ).toEqual(
      expect.arrayContaining(
        Array.from({ length: 26 }, (_, offset) => `source-${70 + offset}`),
      ),
    );
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

    const overflowControl = browserVisualRuntime
      .getSnapshot()
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
      readyReadiness.domControlReadinessByActorId.get(overflowControl.sourceId)
        ?.resourceHandles,
    ).toEqual([{ id: overflowSnapshotSurfaceId, kind: "texture" }]);
  });
});

function renderMountedRowIds({
  chromeReproActive,
  controls,
}: {
  readonly chromeReproActive: boolean;
  readonly controls: readonly GpuRetainedDomControlSourceDescriptor[];
}): readonly string[] {
  (
    window as Window & { __SETTA_CHROME_REPRO_ACTIVE__?: boolean }
  ).__SETTA_CHROME_REPRO_ACTIVE__ = chromeReproActive;
  const viewportRuntime = createMockViewportRuntime([0, 0, 1]);
  const viewportStore = createGpuFlowViewportStore({
    height: 60,
    transform: [0, 0, 1],
    width: 400,
  });
  const host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);

  act(() => {
    root?.render(
      <GpuFlowDomControlPlane
        committedFrameId={1}
        getRetainedScrollOffset={undefined}
        onActivate={undefined}
        renderControl={(control) => (
          <input data-row-id={control.rowId} readOnly value={control.value} />
        )}
        retainedRuntimeFrame={retainedRuntimeFrame(controls)}
        viewportRuntime={viewportRuntime}
        viewportStore={viewportStore}
      />,
    );
  });

  return mountedRowIds();
}

function createMockViewportRuntime(
  initialViewport: GpuViewportTuple,
): GpuFlowViewportRuntime {
  let viewport = initialViewport;
  const overlayManagers: Array<{
    readonly applyViewport: (viewport: GpuViewportTuple) => void;
  }> = [];
  return {
    applyOverlayTransforms(nextViewport: GpuViewportInput = viewport) {
      viewport = normalizeViewportTuple(nextViewport);
      for (const manager of overlayManagers) {
        manager.applyViewport(viewport);
      }
    },
    getViewportTuple() {
      return viewport;
    },
    registerOverlayManager(manager) {
      overlayManagers.push(manager);
      manager.applyViewport(viewport);
      return () => {
        const index = overlayManagers.indexOf(manager);
        if (index >= 0) {
          overlayManagers.splice(index, 1);
        }
      };
    },
  } as unknown as GpuFlowViewportRuntime;
}

function normalizeViewportTuple(viewport: GpuViewportInput): GpuViewportTuple {
  const normalized = normalizeGpuViewport(viewport);
  return [normalized.x, normalized.y, normalized.zoom];
}

function retainedRuntimeFrame(
  controls: readonly GpuRetainedDomControlSourceDescriptor[],
  frameId = 1,
): GpuRetainedRuntimeFrame {
  return {
    descriptors: {
      domControlSources: controls,
    },
    frameId,
  } as GpuRetainedRuntimeFrame;
}

function committedSurfaceFrame({
  displayFrameId,
  retainedRuntimeFrame,
}: {
  readonly displayFrameId: number;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
}): GpuFlowCommittedSurfaceFrame {
  return {
    actorGenerations: [],
    displayFrameId,
    retainedRuntimeFrame,
    sceneRevision: 1,
  } as unknown as GpuFlowCommittedSurfaceFrame;
}

function retainedDisplayFrame({
  id,
  retainedRuntimeFrame,
}: {
  readonly id: number;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
}): RetainedDisplayFrame {
  return {
    id,
    retainedRuntimeFrame,
  } as unknown as RetainedDisplayFrame;
}

function mountedRowIds(): readonly string[] {
  return [
    ...document.querySelectorAll<HTMLElement>(
      "[data-gpu-flow-dom-control='true']",
    ),
  ].map((element) => element.dataset.gpuFlowDomControlRowId ?? "");
}

function domControlCoverageState(
  readiness: GpuFlowCommittedSurfaceBrowserVisualReadiness,
  control: GpuRetainedDomControlSourceDescriptor,
) {
  return readiness.domControlReadinessByActorId.get(control.sourceId)
    ?.coverageState;
}

function committedSnapshotTexture(
  texture: Partial<
    Pick<
      CommittedHtmlSurfaceTextureSnapshot,
      | "dirtyContent"
      | "dirtyResolution"
      | "lastUploadFrame"
      | "textureContentKey"
    >
  > = {},
): CommittedHtmlSurfaceTextureSnapshot {
  return {
    dirtyContent: false,
    dirtyResolution: false,
    lastUploadFrame: 1,
    textureContentKey: "cache-key",
    ...texture,
  } as CommittedHtmlSurfaceTextureSnapshot;
}

function domControl({
  active = false,
  index,
  snapshotSurfaceId = null,
  value = "",
  visualPolicy = "live-dom",
}: {
  readonly active?: boolean | undefined;
  readonly index: number;
  readonly snapshotSurfaceId?: string | null | undefined;
  readonly value?: string | undefined;
  readonly visualPolicy?:
    | GpuRetainedDomControlSourceDescriptor["visualPolicy"]
    | undefined;
}): GpuRetainedDomControlSourceDescriptor {
  const rect = { height: 24, width: 273, x: 0, y: index * 28 };
  const snapshotCacheKey = {
    appThemeRevision: "theme",
    caretVisibility: active ? "visible" : "hidden",
    codeMirrorThemeRevision: "codemirror-theme",
    compositionState: "inactive",
    cssStyleRevision: "value-style",
    defaultValue: "",
    devicePixelRatioBucket: 1,
    disabled: false,
    editorExtensionGeneration: "text|single-line|nowrap",
    editorKind: "text" as const,
    error: false,
    fontGeneration: "fonts",
    language: null,
    linePolicy: "single-line" as const,
    measuredLayoutMode: "single-line" as const,
    placeholder: "",
    rendererFamily: "text-like",
    selectionState: active ? "collapsed" : "none",
    sourceHeight: rect.height,
    sourceWidth: rect.width,
    syntaxGeneration: "plain-text",
    value,
    wrapLines: false,
    zoomBucket: 1,
  } as const;
  const textCoverageState = createTestTextCoverageState(active);
  const textCoverageRevision = JSON.stringify(textCoverageState);
  return {
    active,
    clipChainRevision: "clip",
    clipRectSurfaceCssPx: rect,
    controlId: `control-${index}`,
    controlRectSurfaceCssPx: rect,
    defaultValue: "",
    disabled: false,
    editorKind: "text",
    error: false,
    geometryRevision: "geometry",
    interactionPolicy: GPU_RETAINED_TEXT_LIKE_INTERACTION_POLICY,
    language: null,
    layerSlot: "dom-control-plane",
    lifecycleState: active ? "active-projected" : "passive-projected",
    linePolicy: "single-line",
    maxVisibleLines: 1,
    minVisibleLines: 1,
    projectionVisibility: "viewport-visible",
    rendererFamily: "text-like",
    role: "text-like",
    rowId: `row-${index}`,
    sectionClipRectFlowPx: { height: 10_000, width: 400, x: 0, y: 0 },
    sectionId: "section",
    sectionScrollOffset: { x: 0, y: 0 },
    sectionScrollRevision: 0,
    snapshotCacheKey,
    snapshotCacheKeyRevision: JSON.stringify(snapshotCacheKey),
    snapshotSurfaceId,
    sourceId: `source-${index}`,
    sourceKey: `source-${index}`,
    sourceRectCssPx: rect,
    surfaceId: "surface",
    textCoverageRevision,
    textCoverageState,
    value,
    valueStyleKey: "value-style",
    valueStyleRevision: "value-style",
    viewportRectCssPx: rect,
    viewportSampleRevision: "viewport",
    visualPolicy,
    visualSemantics: {
      accessibility: "visual-only-aria-hidden",
      focusable: false,
      pointer: "retained-activation-model",
      selectable: "none",
    },
    worldRectFlowPx: rect,
    wrapLines: false,
    zOrder: index,
  };
}

function createTestTextCoverageState(active: boolean) {
  return {
    caret: active ? "visible" : "hidden",
    composition: "inactive",
    selection: active ? "collapsed" : "none",
  } as const;
}
