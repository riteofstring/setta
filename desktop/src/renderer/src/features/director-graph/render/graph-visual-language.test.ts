import { describe, expect, it } from "vitest";

import { graphGlyphDrawings } from "./graph-glyph-atlas";
import {
  graphBarrel,
  graphFitFrame,
  graphModeColor,
  graphReferenceFrame,
  graphVisualUniforms,
  graphWarpToScreen,
} from "./graph-visual-language";
import {
  packedGraphDetailCode,
  packedGraphDetails,
  packedGraphEdgeChannelCode,
  packedGraphEdgeChannels,
  packedGraphEmphases,
  packedGraphEmphasisCode,
  packedGraphGlyphs,
  packedGraphModeCode,
  packedGraphModes,
  packedGraphRoleCode,
  packedGraphRoles,
  packedValueAt,
} from "../packed-graph-vocabulary";

describe("graph visual language", () => {
  it("packs each table in packed-code order", () => {
    for (const mode of packedGraphModes) {
      const base = packedGraphModeCode[mode] * 3;
      expect([
        packedValueAt(graphVisualUniforms.modeColor, base),
        packedValueAt(graphVisualUniforms.modeColor, base + 1),
        packedValueAt(graphVisualUniforms.modeColor, base + 2),
      ]).toEqual(graphModeColor[mode].map((value) => Math.fround(value)));
    }
    expect(graphVisualUniforms.role.length).toBe(packedGraphRoles.length * 3);
    expect(graphVisualUniforms.emphasis.length).toBe(packedGraphEmphases.length * 3);
    expect(graphVisualUniforms.detail.length).toBe(packedGraphDetails.length * 3);
    expect(graphVisualUniforms.edgeChannel.length).toBe(packedGraphEdgeChannels.length * 2);
  });

  it("draws a glyph for every packed glyph, in atlas order", () => {
    expect(Object.keys(graphGlyphDrawings).sort()).toEqual([...packedGraphGlyphs].sort());
  });

  it("keeps an interpretation visually distinct from a runtime fact", () => {
    const factAlpha = packedValueAt(
      graphVisualUniforms.emphasis,
      packedGraphEmphasisCode.fact * 3 + 2,
    );
    const interpretedAlpha = packedValueAt(
      graphVisualUniforms.emphasis,
      packedGraphEmphasisCode.interpreted * 3 + 2,
    );
    const interpretedDashes = packedValueAt(
      graphVisualUniforms.emphasis,
      packedGraphEmphasisCode.interpreted * 3 + 1,
    );
    expect(interpretedAlpha).toBeLessThan(factAlpha);
    expect(interpretedDashes).toBeGreaterThan(0);
  });

  it("compacts history without hiding it", () => {
    const detailed = packedValueAt(graphVisualUniforms.detail, packedGraphDetailCode.detailed * 3);
    const compacted = packedValueAt(
      graphVisualUniforms.detail,
      packedGraphDetailCode.compacted * 3,
    );
    expect(compacted).toBeLessThan(detailed);
    expect(compacted).toBeGreaterThan(0);
  });

  it("bows a branch away from the spine and a merge back onto it", () => {
    const branch = packedValueAt(
      graphVisualUniforms.edgeChannel,
      packedGraphEdgeChannelCode.branch * 2 + 1,
    );
    const merge = packedValueAt(
      graphVisualUniforms.edgeChannel,
      packedGraphEdgeChannelCode.merge * 2 + 1,
    );
    const flow = packedValueAt(
      graphVisualUniforms.edgeChannel,
      packedGraphEdgeChannelCode.flow * 2 + 1,
    );
    expect(flow).toBe(0);
    expect(branch).toBeGreaterThan(0);
    expect(merge).toBeLessThan(0);
  });

  it("gives the turn input the largest body", () => {
    const input = packedValueAt(graphVisualUniforms.role, packedGraphRoleCode.input * 3);
    const step = packedValueAt(graphVisualUniforms.role, packedGraphRoleCode.step * 3);
    const outcome = packedValueAt(graphVisualUniforms.role, packedGraphRoleCode.outcome * 3);
    expect(input).toBeGreaterThan(outcome);
    expect(outcome).toBeGreaterThan(step);
  });
});

describe("graph fit frame", () => {
  it("letterboxes the reference frame into a viewport", () => {
    const fit = graphFitFrame(graphReferenceFrame.width, graphReferenceFrame.height);
    expect(fit.fitX).toBeCloseTo(1, 6);
    expect(fit.fitY).toBeCloseTo(1, 6);
    expect(fit.size).toBeCloseTo(1, 6);
  });

  it("shows more context on a large display rather than larger nodes", () => {
    const laptop = graphFitFrame(1512, 982);
    const desktop4k = graphFitFrame(3840, 2160);
    expect(desktop4k.size).toBeLessThanOrEqual(graphReferenceFrame.maxFit);
    expect(desktop4k.fitY).toBeLessThan(laptop.fitY);
    expect(desktop4k.size / laptop.size).toBeLessThan(2);
  });

  it("keeps a phone viewport inside the frame instead of stretching it", () => {
    const phone = graphFitFrame(390, 844);
    expect(phone.fitX).toBeLessThanOrEqual(1);
    expect(phone.fitY).toBeLessThanOrEqual(1);
    expect(phone.size).toBeLessThan(1);
  });
});

describe("graph barrel warp", () => {
  it("leaves the centre alone and pulls the corners inward", () => {
    const centre = graphWarpToScreen(500, 400, 1000, 800);
    expect(centre.x).toBeCloseTo(500, 6);
    expect(centre.y).toBeCloseTo(400, 6);
    const corner = graphWarpToScreen(0, 0, 1000, 800);
    expect(corner.x).toBeGreaterThan(0);
    expect(corner.y).toBeGreaterThan(0);
    expect(graphBarrel).toBeGreaterThan(0);
  });
});
