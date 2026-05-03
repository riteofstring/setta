/* @vitest-environment jsdom */

import { NodeIdContext } from "gpuFlow/NodeIdContext";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import "testUtils/reactRefreshPreamble";
import { NO_DRAG_CLASS_NAME, NO_PAN_CLASS_NAME } from "utils/constants";
import { afterEach, describe, expect, it } from "vitest";
import { HandlePosition } from "../flowTypes";
import {
  makeGpuFlowPortKey,
  useGpuFlowPortRegistry,
} from "../ports/portGeometry";
import { Handle } from "./index";

describe("GpuFlow Handle", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    useGpuFlowPortRegistry.getState().reset();
  });

  it("marks edge handles as GPU gesture-owned targets", () => {
    const markup = renderToStaticMarkup(
      <NodeIdContext.Provider value="section-a">
        <Handle id="port-a" type="source" position={HandlePosition.Right} />
      </NodeIdContext.Provider>,
    );

    expect(markup).toContain(NO_DRAG_CLASS_NAME);
    expect(markup).toContain(NO_PAN_CLASS_NAME);
    expect(markup).toContain('data-id="section-a-port-a-source"');
  });

  it("can leave DOM handles interactive while scene geometry owns port positions", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    act(() => {
      root.render(
        <div data-gpu-flow-node="true">
          <NodeIdContext.Provider value="section-a">
            <Handle
              id="port-a"
              type="source"
              position={HandlePosition.Right}
              registerPortGeometry={false}
            />
          </NodeIdContext.Provider>
        </div>,
      );
    });

    expect(
      useGpuFlowPortRegistry.getState().descriptors[
        makeGpuFlowPortKey("section-a", "port-a", "source")
      ],
    ).toBeUndefined();
    expect(
      host.querySelector("[data-id='section-a-port-a-source']"),
    ).not.toBeNull();

    act(() => root.unmount());
  });

  it("registers DOM geometry by default for standalone surfaces", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    act(() => {
      root.render(
        <div data-gpu-flow-node="true">
          <NodeIdContext.Provider value="section-a">
            <Handle
              id="port-a"
              type="source"
              position={HandlePosition.Right}
            />
          </NodeIdContext.Provider>
        </div>,
      );
    });

    expect(
      useGpuFlowPortRegistry.getState().descriptors[
        makeGpuFlowPortKey("section-a", "port-a", "source")
      ],
    ).toMatchObject({
      nodeId: "section-a",
      portId: "port-a",
      type: "source",
    });

    act(() => root.unmount());
  });
});
