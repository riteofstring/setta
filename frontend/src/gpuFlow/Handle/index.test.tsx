import { NodeIdContext } from "gpuFlow/NodeIdContext";
import { renderToStaticMarkup } from "react-dom/server";
import { NO_DRAG_CLASS_NAME, NO_PAN_CLASS_NAME } from "utils/constants";
import { describe, expect, it } from "vitest";
import { HandlePosition } from "../flowTypes";
import { Handle } from "./index";

describe("GpuFlow Handle", () => {
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
});
