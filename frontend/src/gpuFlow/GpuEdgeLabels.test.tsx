import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  getGpuEdgeLabelLayerStyle,
  getGpuEdgeLabelStyle,
  GpuEdgeLabelLayer,
} from "./GpuEdgeLabels";
import type { GpuEdgeSceneLabel } from "./edges/edgeSources";

describe("GpuEdgeLabelLayer", () => {
  it("aligns edge labels through the GPU viewport transform", () => {
    expect(getGpuEdgeLabelLayerStyle([10, -20, 2])).toEqual({
      transform: "translate(10px, -20px) scale(2)",
    });
    expect(getGpuEdgeLabelStyle(workflowLabel())).toEqual({
      height: 20,
      transform: "translate(152px, 70px)",
      width: 96,
      zIndex: 7,
    });
  });

  it("renders typed edge labels as pointer-transparent overlay content", () => {
    const markup = renderToStaticMarkup(
      <GpuEdgeLabelLayer
        labels={[workflowLabel(), dataEdgeLabel()]}
        viewport={[10, -20, 2]}
      />,
    );

    expect(markup).toContain('data-gpu-flow-edge-label-layer="true"');
    expect(markup).toContain(
      'data-testid="gpu-edge-label-workflow-source-activation:workflow-a"',
    );
    expect(markup).toContain('data-edgeid="workflow-a"');
    expect(markup).toContain("src count &gt;= 3");
    expect(markup).toContain(
      'data-testid="gpu-edge-label-data-edge-label:data-edge-a"',
    );
    expect(markup).toContain('data-edgeid="data-edge-a"');
    expect(markup).toContain("payload");
    expect(markup).toContain("translate(10px, -20px) scale(2)");
    expect(markup).toContain("translate(152px, 70px)");
  });
});

function workflowLabel(): GpuEdgeSceneLabel {
  return {
    edgeId: "workflow-a",
    height: 20,
    id: "workflow-source-activation:workflow-a",
    kind: "workflow-source-activation",
    text: "src count >= 3",
    width: 96,
    x: 200,
    y: 80,
    zIndex: 7,
  };
}

function dataEdgeLabel(): GpuEdgeSceneLabel {
  return {
    edgeId: "data-edge-a",
    height: 18,
    id: "data-edge-label:data-edge-a",
    kind: "data-edge-label",
    text: "payload",
    width: 59.5,
    x: 140,
    y: 60,
    zIndex: 3,
  };
}
