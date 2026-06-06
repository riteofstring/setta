import "pixi.js/text-bitmap";

import { Assets } from "pixi.js";

import { nodeLabelBitmapFontFamily, nodeLabelBitmapFontUrl } from "./pixi-workspace-label-font";

const requiredDistanceFieldRange = 4;
const requiredDistanceFieldType = "msdf";

export async function loadNodeLabelBitmapFont() {
  const font = await loadBitmapFontAsset();
  const fontFamily = requireLoadedFontFamily(font);
  const distanceField = requireMsdfDistanceField(font);

  if (fontFamily !== nodeLabelBitmapFontFamily) {
    throw new Error(
      `workspace node label bitmap font loaded unexpected fontFamily: expected ${nodeLabelBitmapFontFamily}, got ${fontFamily}`,
    );
  }

  return {
    distanceField,
    fontFamily,
  };
}

async function loadBitmapFontAsset() {
  try {
    return await Assets.load(nodeLabelBitmapFontUrl);
  } catch (error) {
    throw new Error(
      `failed to load workspace node label bitmap font from ${nodeLabelBitmapFontUrl}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

function requireLoadedFontFamily(font) {
  if (!font || typeof font.fontFamily !== "string" || font.fontFamily.length === 0) {
    throw new Error(
      `workspace node label bitmap font ${nodeLabelBitmapFontUrl} did not expose a usable fontFamily`,
    );
  }

  return font.fontFamily;
}

function requireMsdfDistanceField(font) {
  const distanceField = font?.distanceField;

  if (
    !distanceField ||
    distanceField.type !== requiredDistanceFieldType ||
    distanceField.range !== requiredDistanceFieldRange
  ) {
    throw new Error(
      `workspace node label bitmap font ${nodeLabelBitmapFontUrl} did not load as an MSDF font with range ${requiredDistanceFieldRange}: ${JSON.stringify(distanceField)}`,
    );
  }

  return distanceField;
}
