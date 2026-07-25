/**
 * The glyph atlas.
 *
 * One row of square cells, one cell per packed glyph, in exactly the packed
 * vocabulary's order — so the atlas cell index *is* the glyph code and the
 * renderer never maps between the two. The drawing table is an exhaustive
 * `satisfies` record: a glyph added to the vocabulary without a drawing fails
 * to compile rather than sampling a neighbour's cell.
 *
 * The mockup chose a glyph by regex-matching the label text
 * (`iconFor`, mockup lines 764–773). The plan forbids inferring semantics from
 * text, so the glyph arrives as a packed column and this module only draws it.
 */

import { packedGraphGlyphs, type PackedGraphGlyph } from "../packed-graph-vocabulary";

/** Draws one glyph centred on the origin of a 64×64 cell. */
export type GraphGlyphDrawing = (context: CanvasRenderingContext2D) => void;

const circle = (context: CanvasRenderingContext2D, x: number, y: number, radius: number): void => {
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
};

const path = (context: CanvasRenderingContext2D, points: readonly (readonly number[])[]): void => {
  context.beginPath();
  points.forEach(([x, y], index) => {
    if (x === undefined || y === undefined) {
      throw new Error("glyph path point is missing a coordinate");
    }
    if (index === 0) {
      context.moveTo(x, y);
      return;
    }
    context.lineTo(x, y);
  });
};

export const graphGlyphDrawings = {
  read: (context) => {
    context.beginPath();
    context.moveTo(-19, 0);
    context.quadraticCurveTo(0, -14, 19, 0);
    context.quadraticCurveTo(0, 14, -19, 0);
    context.closePath();
    context.stroke();
    circle(context, 0, 0, 5);
    context.fill();
  },
  terminal: (context) => {
    context.strokeRect(-19, -15, 38, 30);
    path(context, [
      [-10, -4],
      [-3, 3],
      [-10, 10],
    ]);
    context.stroke();
    path(context, [
      [2, 10],
      [12, 10],
    ]);
    context.stroke();
  },
  edit: (context) => {
    context.beginPath();
    for (let corner = 0; corner < 6; corner += 1) {
      const angle = (corner * Math.PI) / 3;
      const x = Math.cos(angle) * 18;
      const y = Math.sin(angle) * 18;
      if (corner === 0) {
        context.moveTo(x, y);
        continue;
      }
      context.lineTo(x, y);
    }
    context.closePath();
    context.stroke();
    circle(context, 0, 0, 6);
    context.stroke();
  },
  measure: (context) => {
    path(context, [
      [-20, 0],
      [-10, -13],
      [0, 9],
      [10, -7],
      [20, 0],
    ]);
    context.stroke();
  },
  warning: (context) => {
    path(context, [
      [0, -18],
      [18, 16],
      [-18, 16],
    ]);
    context.closePath();
    context.stroke();
    path(context, [
      [0, -5],
      [0, 5],
    ]);
    context.stroke();
    circle(context, 0, 11, 2);
    context.fill();
  },
  check: (context) => {
    path(context, [
      [-15, 0],
      [-4, 13],
      [17, -13],
    ]);
    context.stroke();
  },
  cross: (context) => {
    context.beginPath();
    context.moveTo(-13, -13);
    context.lineTo(13, 13);
    context.moveTo(13, -13);
    context.lineTo(-13, 13);
    context.stroke();
  },
  synthesis: (context) => {
    path(context, [
      [0, -18],
      [18, 0],
      [0, 18],
      [-18, 0],
    ]);
    context.closePath();
    context.stroke();
  },
  search: (context) => {
    circle(context, -4, -4, 12);
    context.stroke();
    path(context, [
      [5, 5],
      [17, 17],
    ]);
    context.stroke();
  },
  document: (context) => {
    context.strokeRect(-12, -17, 24, 34);
    context.beginPath();
    context.moveTo(-6, -7);
    context.lineTo(6, -7);
    context.moveTo(-6, 1);
    context.lineTo(6, 1);
    context.moveTo(-6, 9);
    context.lineTo(2, 9);
    context.stroke();
  },
  dot: (context) => {
    circle(context, 0, 0, 8);
    context.fill();
  },
  microphone: (context) => {
    context.beginPath();
    context.moveTo(-6, -16);
    context.arc(0, -16, 6, Math.PI, 0, false);
    context.lineTo(6, -2);
    context.arc(0, -2, 6, 0, Math.PI, false);
    context.closePath();
    context.stroke();
    context.beginPath();
    context.arc(0, -2, 12, 0.35, Math.PI - 0.35, false);
    context.stroke();
    context.beginPath();
    context.moveTo(0, 10);
    context.lineTo(0, 18);
    context.moveTo(-8, 18);
    context.lineTo(8, 18);
    context.stroke();
  },
} satisfies Record<PackedGraphGlyph, GraphGlyphDrawing>;

/** Cell edge in atlas pixels. */
const graphGlyphCellSize = 64;

export interface GraphGlyphAtlas {
  readonly source: HTMLCanvasElement;
  readonly cellCount: number;
}

/**
 * Rasterises the atlas once at startup. The renderer uploads it as a single
 * texture and samples cell `glyphCode` for every node, so adding a glyph costs
 * no extra draw call and no extra bind.
 */
export function createGraphGlyphAtlas(ownerDocument: Document): GraphGlyphAtlas {
  const cell = graphGlyphCellSize;
  const source = ownerDocument.createElement("canvas");
  source.width = cell * packedGraphGlyphs.length;
  source.height = cell;
  const context = source.getContext("2d");
  if (context === null) {
    throw new Error("director graph glyph atlas requires a 2d canvas context");
  }
  context.strokeStyle = "#fff";
  context.fillStyle = "#fff";
  context.lineWidth = 6;
  context.lineCap = "round";
  context.lineJoin = "round";
  packedGraphGlyphs.forEach((glyph, index) => {
    context.save();
    context.translate(index * cell + cell / 2, cell / 2);
    graphGlyphDrawings[glyph](context);
    context.restore();
  });
  return { source, cellCount: packedGraphGlyphs.length };
}
