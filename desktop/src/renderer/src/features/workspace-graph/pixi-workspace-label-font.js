import labelFontConfig from "./pixi-workspace-label-font-config.json";

export const nodeLabelBitmapFontFamily = labelFontConfig.fontFamily;
export const nodeLabelBitmapFontSize = labelFontConfig.fontSize;
export const compactSelectedNodeLabelBitmapFontSize = labelFontConfig.compactSelectedFontSize;
export const nodeLabelBitmapFontUrl = labelFontConfig.fontUrl;
export const supportedNodeLabelGlyphs = glyphsFromRanges(labelFontConfig.glyphRanges);

const supportedNodeLabelGlyphSet = new Set(Array.from(supportedNodeLabelGlyphs));

export function validateNodeLabelGlyphs(nodeId, label) {
  for (const glyph of Array.from(label)) {
    if (!supportedNodeLabelGlyphSet.has(glyph)) {
      throw new Error(
        `workspace node label "${label}" for node ${nodeId} contains unsupported glyph ${formatGlyph(glyph)}; regenerate ${nodeLabelBitmapFontFamily} with that glyph before rendering normal BitmapText labels`,
      );
    }
  }
}

function glyphsFromRanges(ranges) {
  return ranges
    .flatMap(([start, end]) => {
      const glyphs = [];
      for (let codePoint = start; codePoint <= end; codePoint += 1) {
        glyphs.push(String.fromCodePoint(codePoint));
      }
      return glyphs;
    })
    .join("");
}

function formatGlyph(glyph) {
  return `U+${glyph.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`;
}
