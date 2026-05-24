/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, describe, expect, it } from "vitest";

import { createGpuFlowViewportStore } from "../viewportStore";
import { createGpuFlowBrowserVisualActorRuntime } from "./browserVisualActorRuntime";
import { GpuFlowDomControlPlane } from "./domControlPlane";
import {
  committedSurfaceFrame,
  createCommittedSurfaceRuntimeWithBrowserVisuals,
  createMockViewportRuntime,
  domControl,
  mountedRowIds,
  publicationToken,
  publishBrowserVisualFrame,
  retainedDisplayFrame,
  retainedRuntimeFrame,
  stageBrowserVisualCandidate,
} from "./domControlPlaneProjectionRuntimeTestUtils";

let root: Root | null = null;

describe("GPU flow DOM control projection host publication", () => {
  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
      root = null;
    }
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
    const candidate = browserVisualRuntime.prepareCommittedSurfaceFrame({
      retainedDisplayFrame: retainedDisplayFrame({
        id: 1,
        retainedRuntimeFrame: retainedRuntimeFrame(controls),
      }),
    });
    stageBrowserVisualCandidate({
      browserVisualRuntime,
      candidate,
    });
    expect(
      browserVisualRuntime.getSnapshot().domControls.mountedControls,
    ).toEqual([]);
    const mountedBefore = browserVisualRuntime
      .getPreparationSnapshot()
      .domControls.mountedControls.map((control) => control.rowId);

    retainedScrollY = 280;
    browserVisualRuntime.projectDomControls({
      token: publicationToken(
        committedSurfaceFrame({
          displayFrameId: 0,
          retainedRuntimeFrame: retainedRuntimeFrame([]),
        }),
      ),
      viewport: { x: 0, y: 0, zoom: 1 },
    });

    expect(
      browserVisualRuntime
        .getPreparationSnapshot()
        .domControls.mountedControls.map((control) => control.rowId),
    ).toEqual(mountedBefore);
  });

  it("requires a commit token for current-viewport browser visual projection", () => {
    const browserVisualRuntime = createGpuFlowBrowserVisualActorRuntime();
    browserVisualRuntime.setDomControlProjectionEnvironment({
      getRetainedScrollOffset: undefined,
      viewportRuntime: createMockViewportRuntime([0, 0, 1]),
      viewportStore: createGpuFlowViewportStore({
        height: 60,
        transform: [0, 0, 1],
        width: 400,
      }),
    });

    expect(() =>
      browserVisualRuntime.projectDomControls(undefined as never),
    ).toThrow(/commit publication token/);
    expect(() =>
      browserVisualRuntime.projectDomControls({
        x: 0,
        y: 0,
        zoom: 1,
      } as never),
    ).toThrow(/commit publication token/);
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
    const committedSurfaceRuntime =
      createCommittedSurfaceRuntimeWithBrowserVisuals({
        frame: committedSurfaceFrame({
          displayFrameId: 1,
          retainedRuntimeFrame: retainedRuntimeFrame(activeControls),
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
          retainedRuntimeFrame: retainedRuntimeFrame(passiveControls, 2),
        }),
        viewportRuntime,
        viewportStore,
      });
      root?.render(renderPlane());
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
});
