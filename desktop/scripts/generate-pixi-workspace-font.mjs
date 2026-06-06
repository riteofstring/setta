/* global console, process */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import generateBMFont from "@pixi/msdf-bmfont-xml";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoDesktopRoot = path.resolve(scriptDir, "..");
const configPath = path.join(
  repoDesktopRoot,
  "src/renderer/src/features/workspace-graph/pixi-workspace-label-font-config.json",
);
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const sourceFontPath = path.join(
  repoDesktopRoot,
  "src/renderer/assets/fonts/source/inter/Inter-Bold.ttf",
);
const outputDir = path.join(repoDesktopRoot, "src/renderer/public/fonts/inter-msdf");
const outputFontPath = path.join(outputDir, `${config.fontFamily}.fnt`);
const outputTexturePath = path.join(outputDir, `${config.fontFamily}.png`);
const generationFontSize = config.generationFontSize;
const textureSize = config.textureSize;

if (config.fieldType !== "msdf") {
  throw new Error(`Pixi workspace labels require an MSDF font, got ${config.fieldType}`);
}
if (config.distanceRange !== 4) {
  throw new Error(`Pixi workspace labels require distanceRange=4, got ${config.distanceRange}`);
}
if (!Array.isArray(textureSize) || textureSize.length !== 2) {
  throw new Error(`Pixi workspace label textureSize is invalid: ${JSON.stringify(textureSize)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "setta-inter-msdf-"));
  const tempFontPath = path.join(tempDir, `${config.fontFamily}.ttf`);

  try {
    fs.copyFileSync(sourceFontPath, tempFontPath);
    await generateFont(tempFontPath);
    verifyGeneratedFont();
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
}

function generateFont(tempFontPath) {
  return new Promise((resolve, reject) => {
    generateBMFont(
      tempFontPath,
      {
        charset: glyphsFromRanges(config.glyphRanges),
        distanceRange: config.distanceRange,
        fieldType: config.fieldType,
        filename: path.join(outputDir, config.fontFamily),
        fontSize: generationFontSize,
        outputType: "xml",
        roundDecimal: 0,
        texturePadding: config.texturePadding,
        textureSize,
      },
      (error, textures, font) => {
        if (error) {
          reject(error);
          return;
        }
        for (const texture of textures) {
          fs.writeFileSync(`${texture.filename}.png`, texture.texture);
        }
        fs.writeFileSync(font.filename, font.data);
        resolve();
      },
    );
  });
}

function verifyGeneratedFont() {
  const descriptor = fs.readFileSync(outputFontPath, "utf8");
  const texture = fs.statSync(outputTexturePath);
  const expectedHeader = `face="${config.fontFamily}" size="${generationFontSize}"`;
  const expectedCommon = `scaleW="${textureSize[0]}" scaleH="${textureSize[1]}" pages="1" packed="0"`;
  const expectedPage = `id="0" file="${config.fontFamily}.png"`;
  const expectedDistanceField = `fieldType="${config.fieldType}" distanceRange="${config.distanceRange}"`;
  const expectedChars = `count="${glyphsFromRanges(config.glyphRanges).length}"`;

  assertIncludes(descriptor, "<font>");
  assertIncludes(descriptor, expectedHeader);
  assertIncludes(descriptor, expectedCommon);
  assertIncludes(descriptor, expectedPage);
  assertIncludes(descriptor, expectedDistanceField);
  assertIncludes(descriptor, expectedChars);

  if (texture.size <= 0) {
    throw new Error(`generated Pixi workspace bitmap font texture is empty: ${outputTexturePath}`);
  }
}

function assertIncludes(value, expected) {
  if (!value.includes(expected)) {
    throw new Error(`generated Pixi workspace bitmap font descriptor is missing: ${expected}`);
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
