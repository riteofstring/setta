import { describe, expect, it } from "vitest";

import {
  graphEdgeFragmentShader,
  graphEdgeVertexShader,
  graphFieldFragmentShader,
  graphFieldHaloSlots,
  graphFieldVertexShader,
  graphGlyphFragmentShader,
  graphGlyphVertexShader,
  graphNodeFragmentShader,
  graphNodeVertexShader,
  graphPostFragmentShader,
  graphPostVertexShader,
} from "./graph-shaders";
import { graphBarrel, graphLiveEdgeClipY } from "./graph-visual-language";
import {
  packedGraphDetails,
  packedGraphEdgeChannels,
  packedGraphEmphases,
  packedGraphModeCode,
  packedGraphModes,
  packedGraphRoles,
} from "../packed-graph-vocabulary";

const vertexShaders = {
  field: graphFieldVertexShader,
  edge: graphEdgeVertexShader,
  node: graphNodeVertexShader,
  glyph: graphGlyphVertexShader,
  post: graphPostVertexShader,
};

const fragmentShaders = {
  field: graphFieldFragmentShader,
  edge: graphEdgeFragmentShader,
  node: graphNodeFragmentShader,
  glyph: graphGlyphFragmentShader,
  post: graphPostFragmentShader,
};

const allShaders = {
  ...Object.fromEntries(
    Object.entries(vertexShaders).map(([name, source]) => [`${name} vertex`, source]),
  ),
  ...Object.fromEntries(
    Object.entries(fragmentShaders).map(([name, source]) => [`${name} fragment`, source]),
  ),
};

/** Every `uniform <type> name[size]` declaration, as name → size. */
function uniformArraySizes(source: string): Map<string, number> {
  const sizes = new Map<string, number>();
  for (const match of source.matchAll(/uniform\s+\w+\s+(\w+)\[(\d+)\]/gu)) {
    const name = match[1];
    const size = match[2];
    if (name === undefined || size === undefined) {
      continue;
    }
    sizes.set(name, Number(size));
  }
  return sizes;
}

describe("graph shaders", () => {
  it.each(Object.entries(allShaders))(
    "declares %s as GLSL ES 3.00 on its first line",
    (_name, source) => {
      expect(source.startsWith("#version 300 es\n")).toBe(true);
    },
  );

  it.each(Object.entries(fragmentShaders))(
    "gives %s fragment stage a float precision",
    (_name, source) => {
      expect(source).toContain("precision highp float;");
    },
  );

  it("sizes every uniform table from the packed vocabulary", () => {
    const expected = new Map<string, number>([
      ["u_modeColor", packedGraphModes.length],
      ["u_role", packedGraphRoles.length],
      ["u_emphasis", packedGraphEmphases.length],
      ["u_detail", packedGraphDetails.length],
      ["u_channel", packedGraphEdgeChannels.length],
      ["u_halo", graphFieldHaloSlots],
    ]);
    let checked = 0;
    for (const source of Object.values(allShaders)) {
      for (const [name, size] of uniformArraySizes(source)) {
        expect(expected.get(name)).toBe(size);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(expected.size);
  });

  it("reads the mode codes it compares against from the packed vocabulary", () => {
    // A hand-written literal here would silently select the wrong colour if the
    // vocabulary order ever changed, so the sources interpolate the codes.
    expect(graphNodeVertexShader).toContain(`step(${packedGraphModeCode.success}.0-0.5,a_style.x)`);
    expect(graphNodeVertexShader).toContain(`step(${packedGraphModeCode.fail}.0-0.5,a_style.x)`);
    expect(graphNodeVertexShader).toContain(
      `step(${packedGraphModeCode.listening}.0-0.5,a_style.x)`,
    );
    expect(graphEdgeVertexShader).toContain(`step(${packedGraphModeCode.success}.0-0.5,a_style.x)`);
  });

  it("shares the barrel constant and the live-edge line with the overlay layer", () => {
    expect(graphGlyphVertexShader).toContain(String(graphBarrel));
    expect(graphEdgeVertexShader).toContain(String(graphLiveEdgeClipY));
    expect(graphNodeVertexShader).toContain(String(graphLiveEdgeClipY));
  });

  it("carries no prototype vocabulary and no keyword matching", () => {
    for (const source of Object.values(allShaders)) {
      expect(source).not.toMatch(/struggl/iu);
    }
  });

  it("draws the node, glyph, and edge passes as instanced geometry", () => {
    expect(graphNodeVertexShader).toContain("gl_InstanceID");
    expect(graphGlyphVertexShader).toContain("gl_InstanceID");
    expect(graphEdgeVertexShader).toContain("nodeState(int(a_ends.x))");
  });

  it("reads live node state from the texture rather than from per-frame geometry", () => {
    for (const name of ["edge", "node", "glyph"] as const) {
      expect(vertexShaders[name]).toContain("texelFetch(u_nodeState");
    }
    expect(vertexShaders.field).not.toContain("u_nodeState");
  });

  it("guards the non-terminal edge sentinel before animating failure", () => {
    expect(graphEdgeVertexShader).toContain("if(a_edge.y<1e17)");
    expect(graphEdgeVertexShader).not.toContain(
      "float failP=smoothstep(a_edge.y,a_edge.y+0.35,u_time)",
    );
  });

  it("uses the motion uniform to snap or freeze every autonomous vertex effect", () => {
    expect(graphFieldVertexShader).toContain("float motionTime=u_time*u_flow");
    expect(graphEdgeVertexShader).toContain(
      "float grow=mix(step(a_edge.x,u_time),animatedGrow,u_motion)",
    );
    expect(graphNodeVertexShader).toContain("float motionTime=mix(born,u_time,u_motion)");
    expect(graphNodeVertexShader).toContain("else if(u_motion<0.5)");
    expect(graphGlyphVertexShader).toContain(
      "float rise=mix(step(0.0,age),smoothstep(0.0,0.10,age),u_motion)",
    );
  });
});
