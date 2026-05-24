/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, describe, expect, it } from "vitest";
import { createGpuFlowViewportStore } from "../viewportStore";
import { GpuFlowDomControlPlane } from "./domControlPlane";
import {
  committedSurfaceFrame,
  createCommittedSurfaceRuntimeWithBrowserVisuals,
  createMockViewportRuntime,
  domControl,
  retainedRuntimeFrame,
} from "./domControlPlaneProjectionRuntimeTestUtils";

let root: Root | null = null;

describe("GPU flow DOM control activation", () => {
  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
      root = null;
    }
    document.body.replaceChildren();
  });

  it("activates passive retained DOM-control hosts from mouse down", () => {
    const controls = [domControl({ index: 0 })];
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
    let activated: {
      readonly clientPoint: { readonly x: number; readonly y: number };
      readonly kind: string;
      readonly rowId: string;
      readonly sourceId: string;
    } | null = null;
    root = createRoot(host);

    act(() => {
      root?.render(
        <GpuFlowDomControlPlane
          committedSurfaceRuntime={committedSurfaceRuntime}
          getRetainedScrollOffset={undefined}
          onActivate={(control, activation) => {
            activated = {
              clientPoint: activation.clientPoint,
              kind: activation.kind,
              rowId: control.rowId,
              sourceId: control.sourceId,
            };
          }}
          renderControl={(control) => (
            <div data-row-id={control.rowId}>{control.value}</div>
          )}
          viewportRuntime={viewportRuntime}
          viewportStore={viewportStore}
        />,
      );
    });

    const controlHost = document.querySelector<HTMLElement>(
      "[data-gpu-flow-dom-control-id='source-0']",
    );
    if (!controlHost) {
      throw new Error("Expected row-0 DOM control host to mount.");
    }

    act(() => {
      controlHost.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          button: 0,
          cancelable: true,
          clientX: 14,
          clientY: 10,
        }),
      );
    });

    expect(activated).toEqual({
      clientPoint: { x: 14, y: 10 },
      kind: "pointer",
      rowId: "row-0",
      sourceId: "source-0",
    });
  });
});
