import { describe, expect, it } from "vitest";

import { graphGlyphDrawings } from "./graph-glyph-atlas";
import {
  graphBarrel,
  graphEdgeGeometry,
  graphFitFrame,
  graphModeColor,
  graphReferenceFrame,
  graphVisualUniforms,
  graphWarpToScreen,
} from "./graph-visual-language";
import {
  packedGraphDetailCode,
  packedGraphDetails,
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
  it("keeps the HTML reference palette and beam geometry", () => {
    expect(graphModeColor).toEqual({
      think: [0.3, 0.8, 0.95],
      do: [0.62, 0.45, 1],
      risk: [1, 0.79, 0.26],
      success: [0.36, 0.96, 0.63],
      fail: [1, 0.29, 0.37],
      merge: [0.78, 0.95, 1],
      listening: [0.72, 0.9, 1],
    });
    expect(graphEdgeGeometry).toEqual({
      baseWidth: 0.0035,
      confidenceWidth: 1.15,
      minimumWidth: 0.85,
      growSeconds: 0.6,
    });
  });

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

  it("gives the turn input the largest body", () => {
    const input = packedValueAt(graphVisualUniforms.role, packedGraphRoleCode.input * 3);
    const step = packedValueAt(graphVisualUniforms.role, packedGraphRoleCode.step * 3);
    const outcome = packedValueAt(graphVisualUniforms.role, packedGraphRoleCode.outcome * 3);
    expect(input).toBeGreaterThan(outcome);
    expect(outcome).toBeGreaterThan(step);
  });
});

describe("graph fit frame", () => {
  it("maps the reference frame one-to-one", () => {
    const fit = graphFitFrame(graphReferenceFrame.width, graphReferenceFrame.height);
    expect(fit.fitX).toBeCloseTo(1, 6);
    expect(fit.fitY).toBeCloseTo(1, 6);
  });

  it("keeps node and ladder scale fixed from laptop to 4K", () => {
    const laptop = graphFitFrame(1512, 982);
    const desktop4k = graphFitFrame(3840, 2160);
    expect(desktop4k.fitY).toBeLessThan(laptop.fitY);
    expect(laptop.fitX * 1512).toBe(graphReferenceFrame.width);
    expect(desktop4k.fitX * 3840).toBe(graphReferenceFrame.width);
    expect(laptop.fitY * 982).toBeCloseTo(graphReferenceFrame.height, 6);
    expect(desktop4k.fitY * 2160).toBeCloseTo(graphReferenceFrame.height, 6);
  });

  it("crops or repacks a phone viewport instead of shrinking its graph", () => {
    const phone = graphFitFrame(390, 844);
    expect(phone.fitX).toBeGreaterThan(1);
    expect(phone.fitY).toBeGreaterThan(1);
    expect(phone.fitX * 390).toBeCloseTo(graphReferenceFrame.width, 6);
    expect(phone.fitY * 844).toBeCloseTo(graphReferenceFrame.height, 6);
  });
});

describe("graph barrel warp", () => {
  it("leaves the centre alone and maps source corners to frame corners", () => {
    const centre = graphWarpToScreen(500, 400, 1000, 800);
    expect(centre.x).toBeCloseTo(500, 6);
    expect(centre.y).toBeCloseTo(400, 6);
    const corner = graphWarpToScreen(0, 0, 1000, 800);
    expect(corner.x).toBeCloseTo(0, 1);
    expect(corner.y).toBeCloseTo(0, 1);
    expect(graphBarrel).toBeGreaterThan(0);
  });

  // The normalized post map stays inside the source while the DOM warp remains
  // its exact inverse; otherwise labels drift from their particle bodies.
  it("inverts the post pass's forward map exactly", () => {
    const barrelScale = 1 / (1 + graphBarrel * 0.5);
    for (const [x, y] of [
      [940, 120],
      [60, 700],
      [990, 790],
    ] as const) {
      const point = graphWarpToScreen(x, y, 1000, 800);
      const centeredX = point.x / 1000 - 0.5;
      const centeredY = point.y / 800 - 0.5;
      const forward =
        barrelScale * (1 + graphBarrel * (centeredX * centeredX + centeredY * centeredY));
      expect((centeredX * forward + 0.5) * 1000).toBeCloseTo(x, 2);
      expect((centeredY * forward + 0.5) * 800).toBeCloseTo(y, 2);
    }
  });
});
