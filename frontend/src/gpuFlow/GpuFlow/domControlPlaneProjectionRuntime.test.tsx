/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, describe, expect, it } from "vitest";

import { createGpuFlowCommittedSurfaceRuntime } from "../committedSurfaceRuntime";
import type { CommittedHtmlSurfaceTextureSnapshot } from "../htmlSurfaces/textures";
import type { GpuFlowLiveProjectionSample } from "../projectionRuntime";
import type { GpuRetainedDomControlSourceDescriptor } from "../retainedDomControlScene";
import { createGpuFlowViewportStore } from "../viewportStore";
import {
  createGpuFlowBrowserVisualActorRuntime,
  getGpuFlowBrowserVisualActorRuntimeForCommittedSurface,
  type GpuFlowBrowserVisualActorCandidate,
} from "./browserVisualActorRuntime";
import { GpuFlowDomControlPlane } from "./domControlPlane";
import {
  committedSnapshotTexture,
  committedSurfaceFrame,
  createCommittedSurfaceRuntimeWithBrowserVisuals,
  createMockViewportRuntime,
  domControl,
  domControlCoverageState,
  domControlReadinessResourceHandles,
  mountedRowIds,
  preparationRowIds,
  publicationToken,
  publishBrowserVisualFrame,
  retainedDisplayFrame,
  retainedRuntimeFrame,
  stageBrowserVisualCandidate,
} from "./domControlPlaneProjectionRuntimeTestUtils";
import { getGpuRetainedDomControlSnapshotSurfaceId } from "./retainedDomControlSources";
import { GPU_FLOW_BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID } from "./visibleFramePublicationAuthority";
import { createGpuFlowVisibleFrameBlockedPublicationToken } from "./visibleFramePublicationKernel";
import type { GpuFlowBlockedPublicationToken } from "./visibleFramePublicationTokens";

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

  it("requires a committed publication token before visible host registration", () => {
    const browserVisualRuntime = createGpuFlowBrowserVisualActorRuntime();
    const control = domControl({ index: 0 });
    const element = document.body.appendChild(document.createElement("input"));

    expect(() =>
      browserVisualRuntime.setDomControlElement({
        control,
        element,
        presentation: "preparation",
      }),
    ).not.toThrow();
    expect(() =>
      browserVisualRuntime.setDomControlElement({
        control,
        element,
        presentation: "visible",
      }),
    ).toThrow(/visible browser visual host registration requires/);
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
    const committedSurfaceRuntime =
      createCommittedSurfaceRuntimeWithBrowserVisuals({
        frame: committedSurfaceFrame({
          displayFrameId: 1,
          retainedRuntimeFrame: runtimeFrame,
        }),
        viewportRuntime,
        viewportStore,
      });
    const host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);

    const renderPlane = () => (
      <GpuFlowDomControlPlane
        committedSurfaceRuntime={committedSurfaceRuntime}
        getRetainedScrollOffset={undefined}
        onActivate={undefined}
        renderControl={(control) => (
          <input data-row-id={control.rowId} readOnly value={control.value} />
        )}
        viewportRuntime={viewportRuntime}
        viewportStore={viewportStore}
      />
    );

    act(() => {
      root?.render(renderPlane());
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
      publishBrowserVisualFrame({
        committedSurfaceRuntime,
        frame: committedSurfaceFrame({
          displayFrameId: 2,
          retainedRuntimeFrame: runtimeFrame,
        }),
        viewportRuntime,
        viewportStore,
      });
      root?.render(renderPlane());
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
    const committedSurfaceRuntime =
      createCommittedSurfaceRuntimeWithBrowserVisuals({
        frame: committedSurfaceFrame({
          displayFrameId: 1,
          retainedRuntimeFrame: retainedRuntimeFrame(controls),
        }),
        viewportRuntime,
        viewportStore,
      });
    const host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);

    act(() => {
      root?.render(
        <GpuFlowDomControlPlane
          committedSurfaceRuntime={committedSurfaceRuntime}
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
          viewportRuntime={viewportRuntime}
          viewportStore={viewportStore}
        />,
      );
    });

    expect(document.activeElement).toBe(
      document.querySelector("[data-row-id='row-0']"),
    );
  });

  it("reuses mounted live hosts while candidate projection and snapshot keys change", () => {
    const control = domControl({ index: 0, value: "hello" });
    const nextControl = {
      ...control,
      clipChainRevision: "clip-next",
      clipRectSurfaceCssPx: {
        ...control.clipRectSurfaceCssPx,
        y: control.clipRectSurfaceCssPx.y + 12,
      },
      geometryRevision: "geometry-next",
      snapshotCacheKeyRevision: "snapshot-cache-next",
      worldRectFlowPx: {
        ...control.worldRectFlowPx,
        y: control.worldRectFlowPx.y + 12,
      },
    } satisfies GpuRetainedDomControlSourceDescriptor;
    const viewportRuntime = createMockViewportRuntime([0, 0, 1]);
    const viewportStore = createGpuFlowViewportStore({
      height: 60,
      transform: [0, 0, 1],
      width: 400,
    });
    const committedSurfaceRuntime =
      createCommittedSurfaceRuntimeWithBrowserVisuals({
        frame: committedSurfaceFrame({
          displayFrameId: 1,
          retainedRuntimeFrame: retainedRuntimeFrame([control]),
        }),
        viewportRuntime,
        viewportStore,
      });
    const browserVisualRuntime =
      getGpuFlowBrowserVisualActorRuntimeForCommittedSurface(
        committedSurfaceRuntime,
      );
    const host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);

    act(() => {
      root?.render(
        <GpuFlowDomControlPlane
          committedSurfaceRuntime={committedSurfaceRuntime}
          getRetainedScrollOffset={undefined}
          onActivate={undefined}
          renderControl={(control) => (
            <input data-row-id={control.rowId} readOnly value={control.value} />
          )}
          viewportRuntime={viewportRuntime}
          viewportStore={viewportStore}
        />,
      );
    });

    const candidate = browserVisualRuntime.prepareCommittedSurfaceFrame({
      retainedDisplayFrame: retainedDisplayFrame({
        id: 2,
        retainedRuntimeFrame: retainedRuntimeFrame([nextControl], 2),
      }),
    });

    expect(domControlCoverageState(candidate, nextControl)).toBe(
      "live-host-ready",
    );
  });

  it("mounts preparation hosts when an active candidate differs from the visible host", () => {
    const passiveControl = domControl({ active: false, index: 0 });
    const activeControl = domControl({ active: true, index: 0 });
    const viewportRuntime = createMockViewportRuntime([0, 0, 1]);
    const viewportStore = createGpuFlowViewportStore({
      height: 60,
      transform: [0, 0, 1],
      width: 400,
    });
    const committedSurfaceRuntime =
      createCommittedSurfaceRuntimeWithBrowserVisuals({
        frame: committedSurfaceFrame({
          displayFrameId: 1,
          retainedRuntimeFrame: retainedRuntimeFrame([passiveControl]),
        }),
        viewportRuntime,
        viewportStore,
      });
    const browserVisualRuntime =
      getGpuFlowBrowserVisualActorRuntimeForCommittedSurface(
        committedSurfaceRuntime,
      );
    const host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);
    const renderPlane = () => (
      <GpuFlowDomControlPlane
        committedSurfaceRuntime={committedSurfaceRuntime}
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
        viewportRuntime={viewportRuntime}
        viewportStore={viewportStore}
      />
    );

    act(() => {
      root?.render(renderPlane());
    });
    expect(mountedRowIds()).toEqual(["row-0"]);

    const blockedCandidate = browserVisualRuntime.prepareCommittedSurfaceFrame({
      retainedDisplayFrame: retainedDisplayFrame({
        id: 2,
        retainedRuntimeFrame: retainedRuntimeFrame([activeControl], 2),
      }),
    });
    expect(domControlCoverageState(blockedCandidate, activeControl)).toBe(
      "blocked-awaiting-live-host",
    );

    act(() => {
      stageBrowserVisualCandidate({
        actorId: activeControl.sourceId,
        browserVisualRuntime,
        candidate: blockedCandidate,
        reason: "active-editor",
      });
      root?.render(renderPlane());
    });

    expect(mountedRowIds()).toEqual(["row-0"]);
    expect(preparationRowIds()).toEqual(["row-0"]);

    const readyCandidate = browserVisualRuntime.prepareCommittedSurfaceFrame({
      retainedDisplayFrame: retainedDisplayFrame({
        id: 3,
        retainedRuntimeFrame: retainedRuntimeFrame([activeControl], 3),
      }),
    });
    expect(domControlCoverageState(readyCandidate, activeControl)).toBe(
      "live-host-ready",
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
    const firstFrame = committedSurfaceFrame({
      displayFrameId: 1,
      retainedRuntimeFrame: firstRuntimeFrame,
    });
    const viewportRuntime = createMockViewportRuntime([0, 0, 1]);
    const viewportStore = createGpuFlowViewportStore({
      height: 60,
      transform: [0, 0, 1],
      width: 400,
    });
    const committedSurfaceRuntime =
      createCommittedSurfaceRuntimeWithBrowserVisuals({
        frame: firstFrame,
        viewportRuntime,
        viewportStore,
      });
    const host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);

    act(() => {
      root?.render(
        <GpuFlowDomControlPlane
          committedSurfaceRuntime={committedSurfaceRuntime}
          getRetainedScrollOffset={undefined}
          onActivate={undefined}
          renderControl={(control) => (
            <input data-row-id={control.rowId} readOnly value={control.value} />
          )}
          viewportRuntime={viewportRuntime}
          viewportStore={viewportStore}
        />,
      );
    });
    expect(mountedRowIds()).toEqual(["row-0"]);

    act(() => {
      const frame = committedSurfaceFrame({
        displayFrameId: 2,
        retainedRuntimeFrame: nextRuntimeFrame,
      });
      publishBrowserVisualFrame({
        committedSurfaceRuntime,
        frame,
        viewportRuntime,
        viewportStore,
      });
    });

    expect(mountedRowIds()).toEqual(["row-1"]);
    expect(
      document.querySelector<HTMLElement>(
        "[data-gpu-flow-dom-control-plane='true']",
      )?.dataset.gpuFlowDomControlPlaneCommittedFrameId,
    ).toBe("2");
  });

  it("prepares candidate hosts offscreen before reporting live-host readiness", () => {
    const firstControl = domControl({ index: 0 });
    const nextControl = domControl({ index: 1 });
    const firstRuntimeFrame = retainedRuntimeFrame([firstControl]);
    const nextRuntimeFrame = retainedRuntimeFrame([nextControl], 2);
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
    publishBrowserVisualFrame({
      committedSurfaceRuntime,
      frame: committedSurfaceFrame({
        displayFrameId: 1,
        retainedRuntimeFrame: firstRuntimeFrame,
      }),
      viewportRuntime,
      viewportStore,
    });
    const host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);

    act(() => {
      root?.render(
        <GpuFlowDomControlPlane
          committedSurfaceRuntime={committedSurfaceRuntime}
          getRetainedScrollOffset={undefined}
          onActivate={undefined}
          renderControl={(control) => (
            <input data-row-id={control.rowId} readOnly value={control.value} />
          )}
          viewportRuntime={viewportRuntime}
          viewportStore={viewportStore}
        />,
      );
    });

    let firstReadiness: GpuFlowBrowserVisualActorCandidate | undefined;
    act(() => {
      firstReadiness = browserVisualRuntime.prepareCommittedSurfaceFrame({
        retainedDisplayFrame: retainedDisplayFrame({
          id: 1,
          retainedRuntimeFrame: firstRuntimeFrame,
        }),
      });
    });
    expect(domControlCoverageState(firstReadiness!, firstControl)).toBe(
      "live-host-ready",
    );

    let blockedReadiness: GpuFlowBrowserVisualActorCandidate | undefined;
    act(() => {
      blockedReadiness = browserVisualRuntime.prepareCommittedSurfaceFrame({
        retainedDisplayFrame: retainedDisplayFrame({
          id: 2,
          retainedRuntimeFrame: nextRuntimeFrame,
        }),
      });
    });
    expect(domControlCoverageState(blockedReadiness!, nextControl)).toBe(
      "blocked-awaiting-live-host",
    );
    act(() => {
      stageBrowserVisualCandidate({
        actorId: nextControl.sourceId,
        browserVisualRuntime,
        candidate: blockedReadiness!,
        reason: "live-dom-budget",
      });
    });

    let readyReadiness: GpuFlowBrowserVisualActorCandidate | undefined;
    act(() => {
      readyReadiness = browserVisualRuntime.prepareCommittedSurfaceFrame({
        retainedDisplayFrame: retainedDisplayFrame({
          id: 2,
          retainedRuntimeFrame: nextRuntimeFrame,
        }),
      });
    });

    expect(mountedRowIds()).not.toContain("row-1");
    expect(preparationRowIds()).toContain("row-1");
    expect(domControlCoverageState(readyReadiness!, nextControl)).toBe(
      "live-host-ready",
    );
    act(() => {
      browserVisualRuntime.commitPreparedBrowserVisualActors({
        candidate: readyReadiness!,
        token: publicationToken(
          committedSurfaceFrame({
            displayFrameId: 2,
            retainedRuntimeFrame: nextRuntimeFrame,
          }),
        ),
      });
    });
    expect(
      browserVisualRuntime
        .getSnapshot()
        .domControls.mountedControls.map((control) => control.rowId),
    ).toContain("row-1");
    expect(
      browserVisualRuntime.getPreparationSnapshot().domControls.mountedControls,
    ).toEqual([]);
  });

  it("reports compatible previous projection as proof-backed readiness", () => {
    const firstControl = domControl({ index: 1, value: "hello" });
    const nextControl = {
      ...firstControl,
      projectionVisibility: "viewport-visible" as const,
      snapshotSurfaceId: null,
      visualPolicy: "blocked-awaiting-browser-visual" as const,
    };
    const firstRuntimeFrame = retainedRuntimeFrame([firstControl], 1);
    const nextRuntimeFrame = retainedRuntimeFrame([nextControl], 2);
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
    browserVisualRuntime.setDomControlElement({
      control: firstControl,
      element: document.body.appendChild(document.createElement("input")),
      presentation: "preparation",
    });

    const firstCandidate = browserVisualRuntime.prepareCommittedSurfaceFrame({
      retainedDisplayFrame: retainedDisplayFrame({
        id: 1,
        retainedRuntimeFrame: firstRuntimeFrame,
      }),
    });
    expect(domControlCoverageState(firstCandidate, firstControl)).toBe(
      "live-host-ready",
    );

    const uncommittedCompatibleCandidate =
      browserVisualRuntime.prepareCommittedSurfaceFrame({
        retainedDisplayFrame: retainedDisplayFrame({
          id: 2,
          retainedRuntimeFrame: nextRuntimeFrame,
        }),
      });
    expect(
      domControlCoverageState(uncommittedCompatibleCandidate, nextControl),
    ).toBe("blocked-awaiting-snapshot");
    browserVisualRuntime.commitPreparedBrowserVisualActors({
      candidate: firstCandidate,
      token: publicationToken(
        committedSurfaceFrame({
          displayFrameId: 1,
          retainedRuntimeFrame: firstRuntimeFrame,
        }),
      ),
    });

    const compatibleCandidate =
      browserVisualRuntime.prepareCommittedSurfaceFrame({
        retainedDisplayFrame: retainedDisplayFrame({
          id: 2,
          retainedRuntimeFrame: nextRuntimeFrame,
        }),
      });
    const readiness =
      compatibleCandidate.readiness.domControlReadinessByActorId.get(
        nextControl.sourceId,
      );

    expect(readiness).toEqual(
      expect.objectContaining({
        compatibilityProof: expect.objectContaining({
          actorId: nextControl.sourceId,
          reasonCode: "same-value-and-geometry",
        }),
        coverageState: "compatible-previous-ready",
      }),
    );
  });

  it("does not emit preparation snapshots until a hold or blocked outcome stages the candidate", () => {
    const nextControl = domControl({ index: 1 });
    const nextRuntimeFrame = retainedRuntimeFrame([nextControl], 2);
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
    let preparationEmitCount = 0;
    const unsubscribe = browserVisualRuntime.subscribePreparation(() => {
      preparationEmitCount += 1;
    });

    const candidate = browserVisualRuntime.prepareCommittedSurfaceFrame({
      retainedDisplayFrame: retainedDisplayFrame({
        id: 2,
        retainedRuntimeFrame: nextRuntimeFrame,
      }),
    });

    expect(preparationEmitCount).toBe(0);
    expect(
      browserVisualRuntime.getPreparationSnapshot().domControls.mountedControls,
    ).toEqual([]);

    stageBrowserVisualCandidate({
      actorId: nextControl.sourceId,
      browserVisualRuntime,
      candidate,
    });

    expect(preparationEmitCount).toBe(1);
    expect(
      browserVisualRuntime
        .getPreparationSnapshot()
        .domControls.mountedControls.map((control) => control.rowId),
    ).toContain("row-1");
    unsubscribe();
  });

  it("rejects unbranded tokens when staging prepared candidate hosts", () => {
    const nextControl = domControl({ index: 1 });
    const nextRuntimeFrame = retainedRuntimeFrame([nextControl], 2);
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

    const candidate = browserVisualRuntime.prepareCommittedSurfaceFrame({
      retainedDisplayFrame: retainedDisplayFrame({
        id: 2,
        retainedRuntimeFrame: nextRuntimeFrame,
      }),
    });

    expect(() =>
      browserVisualRuntime.stagePreparedBrowserVisualActors({
        candidate,
        token: {
          projectionSampleId: 2,
        } as unknown as GpuFlowBlockedPublicationToken,
      }),
    ).toThrow(/hold-previous or blocked publication token/);
    expect(
      browserVisualRuntime.getPreparationSnapshot().domControls.mountedControls,
    ).toEqual([]);
  });

  it("aborts prepared candidate hosts without publishing the visible snapshot", () => {
    const nextControl = domControl({ index: 1 });
    const nextRuntimeFrame = retainedRuntimeFrame([nextControl], 2);
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

    const candidate = browserVisualRuntime.prepareCommittedSurfaceFrame({
      retainedDisplayFrame: retainedDisplayFrame({
        id: 2,
        retainedRuntimeFrame: nextRuntimeFrame,
      }),
    });
    stageBrowserVisualCandidate({
      actorId: nextControl.sourceId,
      browserVisualRuntime,
      candidate,
    });
    expect(
      browserVisualRuntime
        .getPreparationSnapshot()
        .domControls.mountedControls.map((control) => control.rowId),
    ).toContain("row-1");

    browserVisualRuntime.abortPreparedBrowserVisualActors({
      candidate,
      token: createGpuFlowVisibleFrameBlockedPublicationToken({
        blockedReasons: [
          {
            actorId: nextControl.sourceId,
            family: "dom-control",
            reason: "snapshot-pending",
          },
        ],
        frozenFrameId: GPU_FLOW_BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID,
        projectionSample: { id: 2 } as GpuFlowLiveProjectionSample,
      }),
    });

    expect(
      browserVisualRuntime.getPreparationSnapshot().domControls.mountedControls,
    ).toEqual([]);
    expect(
      browserVisualRuntime.getSnapshot().domControls.mountedControls,
    ).toEqual([]);
  });

  it("rejects unbranded tokens when aborting prepared candidate hosts", () => {
    const nextControl = domControl({ index: 1 });
    const nextRuntimeFrame = retainedRuntimeFrame([nextControl], 2);
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

    const candidate = browserVisualRuntime.prepareCommittedSurfaceFrame({
      retainedDisplayFrame: retainedDisplayFrame({
        id: 2,
        retainedRuntimeFrame: nextRuntimeFrame,
      }),
    });

    expect(() =>
      browserVisualRuntime.abortPreparedBrowserVisualActors({
        candidate,
        token: {
          projectionSampleId: 2,
        } as unknown as GpuFlowBlockedPublicationToken,
      }),
    ).toThrow(/hold-previous or blocked publication token/);
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
    const targetedReadiness = browserVisualRuntime.prepareCommittedSurfaceFrame({
      retainedDisplayFrame: retainedDisplayFrame({
        id: 2,
        retainedRuntimeFrame: runtimeFrame,
      }),
    });
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
    ).toEqual(
      expect.arrayContaining([targetedControl.sourceId]),
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

  it("repairs blocked browser-visual controls through staged exact snapshots", () => {
    const blockedControl = domControl({
      index: 0,
      value: "blocked visual value",
      visualPolicy: "blocked-awaiting-browser-visual",
    });
    const runtimeFrame = retainedRuntimeFrame([blockedControl]);
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

    const blockedSnapshotSurfaceId =
      getGpuRetainedDomControlSnapshotSurfaceId(blockedControl);
    expect(domControlCoverageState(firstReadiness, blockedControl)).toBe(
      "blocked-awaiting-snapshot",
    );
    expect(
      browserVisualRuntime
        .getPreparationSnapshot()
        .domControls.snapshotControls.map((control) => control.sourceId),
    ).toContain(blockedControl.sourceId);

    const element = document.body.appendChild(document.createElement("div"));
    browserVisualRuntime.setDomControlSnapshotElement({
      element,
      surfaceId: blockedSnapshotSurfaceId,
    });
    committedTextureBySurfaceId.set(
      blockedSnapshotSurfaceId,
      committedSnapshotTexture({
        textureContentKey: blockedControl.snapshotCacheKeyRevision,
      }),
    );

    const readyReadiness = browserVisualRuntime.prepareCommittedSurfaceFrame({
      retainedDisplayFrame: retainedDisplayFrame({
        id: 2,
        retainedRuntimeFrame: runtimeFrame,
      }),
    });

    expect(domControlCoverageState(readyReadiness, blockedControl)).toBe(
      "exact-snapshot-ready",
    );
    expect(
      domControlReadinessResourceHandles(readyReadiness, blockedControl),
    ).toEqual([
      expect.objectContaining({
        actorId: blockedControl.sourceId,
        contentGenerationId: blockedControl.snapshotCacheKeyRevision,
        id: blockedSnapshotSurfaceId,
        kind: "texture",
        projectionGenerationId: expect.any(String),
        resourceGenerationId: expect.any(String),
      }),
    ]);
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
  const committedSurfaceRuntime =
    createCommittedSurfaceRuntimeWithBrowserVisuals({
      frame: committedSurfaceFrame({
        displayFrameId: 1,
        retainedRuntimeFrame: retainedRuntimeFrame(controls),
      }),
      viewportRuntime,
      viewportStore,
    });
  const host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);

  act(() => {
    root?.render(
      <GpuFlowDomControlPlane
        committedSurfaceRuntime={committedSurfaceRuntime}
        getRetainedScrollOffset={undefined}
        onActivate={undefined}
        renderControl={(control) => (
          <input data-row-id={control.rowId} readOnly value={control.value} />
        )}
        viewportRuntime={viewportRuntime}
        viewportStore={viewportStore}
      />,
    );
  });

  return mountedRowIds();
}
