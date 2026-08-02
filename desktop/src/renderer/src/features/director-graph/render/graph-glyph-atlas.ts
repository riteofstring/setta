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

import checkFillSvg from "@phosphor-icons/core/fill/check-fat-fill.svg?raw";
import crossFillSvg from "@phosphor-icons/core/fill/x-circle-fill.svg?raw";
import dotFillSvg from "@phosphor-icons/core/fill/dot-outline-fill.svg?raw";
import editFillSvg from "@phosphor-icons/core/fill/pencil-simple-fill.svg?raw";
import measureFillSvg from "@phosphor-icons/core/fill/gauge-fill.svg?raw";
import microphoneFillSvg from "@phosphor-icons/core/fill/microphone-fill.svg?raw";
import readFillSvg from "@phosphor-icons/core/fill/eye-fill.svg?raw";
import searchFillSvg from "@phosphor-icons/core/fill/magnifying-glass-fill.svg?raw";
import synthesisFillSvg from "@phosphor-icons/core/fill/diamond-fill.svg?raw";
import terminalFillSvg from "@phosphor-icons/core/fill/terminal-window-fill.svg?raw";
import documentFillSvg from "@phosphor-icons/core/fill/file-text-fill.svg?raw";
import warningFillSvg from "@phosphor-icons/core/fill/warning-fill.svg?raw";

import { packedGraphGlyphs, type PackedGraphGlyph } from "../packed-graph-vocabulary";

/** Draws one glyph centred on the origin of a 64×64 cell. */
export type GraphGlyphDrawing = (context: CanvasRenderingContext2D) => void;

const phosphorViewBoxSize = 256;
const phosphorAtlasIconSize = 52;

/**
 * Converts the selected Phosphor Fill asset into a cached canvas path. The SVG
 * strings are build-time imports, and each Path2D is created only when the
 * renderer builds its one shared atlas — never during a frame.
 *
 * Phosphor Icons is MIT licensed: https://phosphoricons.com
 */
function phosphorFillDrawing(
  glyph: PackedGraphGlyph,
  svg: string,
  atlasIconSize = phosphorAtlasIconSize,
): GraphGlyphDrawing {
  const pathData = Array.from(svg.matchAll(/\sd="([^"]+)"/g), (match) => match[1]).filter(
    (data): data is string => data !== undefined,
  );
  if (pathData.length === 0) {
    throw new Error(`Phosphor Fill asset for graph glyph "${glyph}" has no path data`);
  }

  let paths: readonly Path2D[] | undefined;
  return (context) => {
    paths ??= pathData.map((data) => new Path2D(data));
    const scale = atlasIconSize / phosphorViewBoxSize;
    context.save();
    context.scale(scale, scale);
    context.translate(-phosphorViewBoxSize / 2, -phosphorViewBoxSize / 2);
    for (const iconPath of paths) {
      context.fill(iconPath);
    }
    context.restore();
  };
}

export const graphGlyphDrawings = {
  read: phosphorFillDrawing("read", readFillSvg),
  terminal: phosphorFillDrawing("terminal", terminalFillSvg),
  edit: phosphorFillDrawing("edit", editFillSvg),
  measure: phosphorFillDrawing("measure", measureFillSvg),
  warning: phosphorFillDrawing("warning", warningFillSvg),
  check: phosphorFillDrawing("check", checkFillSvg),
  cross: phosphorFillDrawing("cross", crossFillSvg),
  synthesis: phosphorFillDrawing("synthesis", synthesisFillSvg),
  search: phosphorFillDrawing("search", searchFillSvg),
  document: phosphorFillDrawing("document", documentFillSvg),
  dot: phosphorFillDrawing("dot", dotFillSvg, 72),
  microphone: phosphorFillDrawing("microphone", microphoneFillSvg),
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
  context.fillStyle = "#fff";
  packedGraphGlyphs.forEach((glyph, index) => {
    context.save();
    context.translate(index * cell + cell / 2, cell / 2);
    graphGlyphDrawings[glyph](context);
    context.restore();
  });
  return { source, cellCount: packedGraphGlyphs.length };
}
