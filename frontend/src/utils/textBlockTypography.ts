export const TEXT_BLOCK_FONT_SIZE_MIN = 8;
export const TEXT_BLOCK_FONT_SIZE_MAX = 48;
export const TEXT_BLOCK_FONT_SIZE_DEFAULT = 14;

export type TextBlockTypographyScale = {
  bodyPx: number;
  codePx: number;
  h1Px: number;
  h2Px: number;
  h3Px: number;
  h4Px: number;
  h5Px: number;
  h6Px: number;
};

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

export function clampTextBlockMasterFontSize(value: number): number {
  if (!Number.isFinite(value)) {
    return TEXT_BLOCK_FONT_SIZE_DEFAULT;
  }
  return Math.max(
    TEXT_BLOCK_FONT_SIZE_MIN,
    Math.min(TEXT_BLOCK_FONT_SIZE_MAX, value),
  );
}

export function buildTextBlockTypographyScale(
  masterFontSizePx: number,
): TextBlockTypographyScale {
  const base = clampTextBlockMasterFontSize(masterFontSizePx);
  return {
    bodyPx: roundToTenth(base),
    codePx: roundToTenth(base * 0.92),
    h1Px: roundToTenth(base * 2.0),
    h2Px: roundToTenth(base * 1.6),
    h3Px: roundToTenth(base * 1.35),
    h4Px: roundToTenth(base * 1.18),
    h5Px: roundToTenth(base * 1.04),
    h6Px: roundToTenth(base * 0.95),
  };
}
