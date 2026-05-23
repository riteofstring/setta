import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { GpuFlowCommittedSurfaceRuntime } from "../committedSurfaceRuntime";
import type { GpuSurfaceHandle } from "../GpuSurface";
import { createGpuFlowViewportStore } from "../viewportStore";
import { createMockViewportRuntime } from "./domControlPlaneProjectionRuntimeTestUtils";
import { GpuFlowSurfaceView } from "./flowSurfaceView";
import {
  GPU_FLOW_BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID,
  type GpuFlowColdStartShellFrame,
} from "./visibleFramePublicationAuthority";

describe("GpuFlowSurfaceView", () => {
  it("renders a blocked cold-start shell as an overlay while projection hosts stay mounted", () => {
    const markup = renderToStaticMarkup(
      <GpuFlowSurfaceView
        className="setta-gpu-flow"
        coldStartShellFrame={coldStartShellFrame()}
        committedSurfaceRuntime={throwingCommittedSurfaceRuntime()}
        containerRef={createRef<HTMLDivElement>()}
        deviceOptions={undefined}
        edgeLabelSourceElement={null}
        getRetainedDomControlScrollOffset={() => null}
        handleFrame={() => undefined}
        handlePaint={() => undefined}
        handleReady={() => undefined}
        handleResize={() => undefined}
        layoutStore={undefined}
        nodeClassName={undefined}
        nodeDragPreviewSourceElement={null}
        nodeResizeOverlaySourceElement={null}
        nodes={[]}
        onDomControlActivation={undefined}
        onNodeElementChange={() => undefined}
        portals={undefined}
        renderDomIsland={() => <div data-rendered-dom-island="true" />}
        renderNode={undefined}
        renderRetainedDomControl={() => <input data-rendered-control="true" />}
        retainedDomControlSnapshotSourceElement={null}
        sceneContextValue={{ getScene: () => undefined }}
        selectionDrag={undefined}
        selectionOverlaySourceElement={null}
        style={undefined}
        surfaceClassName={undefined}
        surfaceRef={createRef<GpuSurfaceHandle>()}
        viewportRuntime={createMockViewportRuntime([0, 0, 1])}
        viewportStore={createGpuFlowViewportStore({
          transform: [0, 0, 1],
        })}
      >
        {null}
      </GpuFlowSurfaceView>,
    );

    expect(markup).toContain('data-gpu-flow-cold-start-shell="true"');
    expect(markup).toContain(
      `data-gpu-flow-cold-start-shell-frame-id="${GPU_FLOW_BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID}"`,
    );
    expect(markup).toContain('data-gpu-flow-cold-start-shell-input="disabled"');
    expect(markup).toContain(
      'data-gpu-flow-cold-start-shell-reason="browser-visual-publication-blocked-before-first-commit"',
    );
    expect(markup).toContain("Preparing surface");
    expect(markup).toContain("data-gpu-flow-dom-control-plane");
    expect(markup).toContain("data-gpu-flow-dom-island-layer");
    expect(markup).not.toContain("data-rendered-dom-island");
  });
});

function coldStartShellFrame(): GpuFlowColdStartShellFrame {
  return {
    id: GPU_FLOW_BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID,
    input: "disabled",
    kind: "cold-start-shell",
    reason: "browser-visual-publication-blocked-before-first-commit",
  };
}

function throwingCommittedSurfaceRuntime(): GpuFlowCommittedSurfaceRuntime {
  return new Proxy(
    {},
    {
      get() {
        throw new Error(
          "Cold-start shell must not mount committed projection hosts.",
        );
      },
    },
  ) as GpuFlowCommittedSurfaceRuntime;
}
