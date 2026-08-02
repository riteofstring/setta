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
  graphLoadingTargetSlots,
} from "./graph-shaders";
import { graphBarrel, graphLiveEdgeClipY } from "./graph-visual-language";
import {
  packedGraphDetails,
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
      ["u_nodes", graphFieldHaloSlots],
      ["u_loadingTargets", graphLoadingTargetSlots],
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

  /*
   * Every pass discards in the space it draws in.
   *
   * The node and edge passes tested the world offset while positioning the
   * fitted one, so on a tall, narrow window — where the fit is smallest — they
   * threw away geometry that the fitted position puts well inside the viewport.
   * The glyph pass already had this right: it fits when it builds the vector,
   * which is why the check below looks at the operand rather than the compare.
   */
  it("culls each pass against the fitted position it draws at", () => {
    for (const source of [graphNodeVertexShader, graphEdgeVertexShader, graphGlyphVertexShader]) {
      const culls = [...source.matchAll(/if\(([^;]*?1\.3[^;]*?)\)\{ gl_Position=vec4\(2\.0/gu)];
      expect(culls.length).toBeGreaterThan(0);
      for (const cull of culls) {
        const compared = cull[1] ?? "";
        const fittedHere = compared.includes("u_fitY");
        // Otherwise the vector it compares was fitted where it was built.
        const definitions = source.slice(0, cull.index ?? 0);
        const fittedEarlier = /vec2 (?:center|A|B)=[^;]*u_fitY[^;]*;\s*$/u.test(
          definitions.slice(-400),
        );
        expect(fittedHere || fittedEarlier).toBe(true);
      }
    }
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

  it("reveals replacement layouts in semantic passes without moving the field", () => {
    for (const name of ["edge", "node", "glyph"] as const) {
      expect(vertexShaders[name]).toContain("u_layoutReveal");
    }
    expect(vertexShaders.field).not.toContain("u_layoutReveal");
  });

  it("keeps the opt-in edge wake off node cores", () => {
    expect(graphNodeVertexShader).toContain("u_disturbance");
    expect(graphNodeVertexShader).toContain("directorMask");
    expect(graphNodeVertexShader).toContain("step(0.5,a_particleRole)");
    expect(graphNodeVertexShader).toContain(
      "u_disturbance*directorMask*step(0.5,a_particleRole)*u_motion",
    );
  });

  it("has no viewport-controlled node-size uniform", () => {
    expect(graphNodeVertexShader).not.toContain("u_scale");
  });

  it("applies one fixed supporting hierarchy scale to particle bodies and glyphs", () => {
    for (const source of [graphNodeVertexShader, graphGlyphVertexShader]) {
      expect(source).toContain("u_supportingNodeScale");
      expect(source).toContain("u_directorNodeEnd");
      expect(source).toContain("hierarchyScale");
    }
    expect(graphNodeVertexShader).toContain("pos=center+(pos-center)*hierarchyScale");
    expect(graphNodeVertexShader).toContain("psize*=hierarchyScale");
    expect(graphGlyphVertexShader).toContain("detail.x*hierarchyScale");
  });

  it("fades short grid trails without shortening their edge geometry", () => {
    expect(graphEdgeVertexShader).toContain("u_gridTrailOpacity");
    expect(graphEdgeVertexShader).toContain("v_openAlpha=mix(1.0,sqrt(open),sideGridTrail)");
    expect(graphEdgeVertexShader).toContain("v_grow=grow*mix(open,1.0,sideGridTrail)");
    expect(graphEdgeFragmentShader).toContain("*v_openAlpha");
  });

  it("guards the non-terminal edge sentinel before animating failure", () => {
    expect(graphEdgeVertexShader).toContain("if(a_edge.y<1e17)");
    expect(graphEdgeVertexShader).not.toContain(
      "float failP=smoothstep(a_edge.y,a_edge.y+0.35,u_time)",
    );
  });

  it("keeps reference failure sizing and one edge weight across real topology", () => {
    expect(graphNodeVertexShader).toContain(
      "float failedBodySize=(40.0+recent*20.0+hover*38.0)*detail.x",
    );
    expect(graphNodeVertexShader).toContain("psize=failedBodySize*pop");
    expect(graphNodeVertexShader).not.toContain("bodySize*pop*0.72");
    expect(graphEdgeVertexShader).toContain("float width=u_width*(0.85+a_edge.z*1.15)");
    expect(graphEdgeVertexShader).not.toContain("u_channelWidth");
  });

  it("keeps the reference failure eclipse, glyph, and beam energy", () => {
    expect(graphNodeFragmentShader).toContain("vec2 sc=offset*2.0+vec2(0.10,0.16)*v_eclipse");
    expect(graphNodeFragmentShader).toContain("float sd=length(sc), shR=0.30+v_eclipse*0.30");
    expect(graphNodeFragmentShader).toContain("col=mix(col,vec3(1.0,0.52,0.44),rim*v_eclipse*0.9)");
    expect(graphGlyphFragmentShader).toContain("col=mix(col,vec3(0.5,0.28,0.30),v_fail)");
    expect(graphGlyphFragmentShader).toContain("col*=mix(1.0,0.55,v_fail)");
    expect(graphEdgeFragmentShader).toContain(
      "float a=(drawn*(0.52+v_recent*0.34)*dash*(1.0+v_failP*0.8)+lead*(0.9+v_recent*0.5))*v_openAlpha",
    );
  });

  it("keeps the mockup field drift and gates the semantic vertex effects", () => {
    expect(graphFieldVertexShader).toContain("p.y+=(u_cam*0.16+u_time*0.004)*depth");
    expect(graphFieldVertexShader).toContain("p+=flow*(0.035*depth*fl)");
    expect(graphFieldVertexShader).toContain("u_densityScale");
    expect(graphFieldVertexShader).toContain("vec2 displacement=(p-base)*2.0");
    expect(graphFieldVertexShader).toContain("particleScale*2.0)-particleScale");
    expect(graphFieldVertexShader).toContain("if(u_loading>0.001)");
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
