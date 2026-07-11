// Pure half of the Easy Button pixel-match harness: screenshot clipping, and the
// diff between the pane's measured components and the mockup's. No Electron and
// no CDP, so the mockup renderer (an Electron main process) can import it without
// dragging in the workflow harness.

import { Buffer } from "node:buffer";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

// Two phases far enough apart that the swirl arms sit in visibly different, and
// exactly reproducible, rotations: 4.5s is a quarter turn of the fastest layer.
export const pinTimesMs = [0, 4500];

// The pane cannot show both rails at once — no scripted run emits highlights and
// artifacts together — so the two `completed` frames split them, and both compare
// against the mockup's single fully-populated `complete`.
export const metricPairs = [
  { mockup: "idle", production: "idle" },
  { mockup: "working", production: "working" },
  { mockup: "complete", production: "completedArtifacts" },
  { mockup: "complete", production: "completedHighlights" },
];

export async function writePng(path, base64) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, Buffer.from(base64, "base64"));
}

// The swirl is three times the width of the button well and the stage clips it,
// so its own rect runs outside the pane. A screenshot clip may not.
//
// Clips are snapped to whole pixels: a fractional origin lands the same content
// on a different subpixel grid, and the crop then differs between runs by a
// channel step or two for reasons that have nothing to do with the pane.
export function clipToBounds(rect, bounds) {
  const x = Math.ceil(Math.max(rect.x, bounds.x));
  const y = Math.ceil(Math.max(rect.y, bounds.y));
  const right = Math.floor(Math.min(rect.x + rect.width, bounds.x + bounds.width));
  const bottom = Math.floor(Math.min(rect.y + rect.height, bounds.y + bounds.height));
  if (right <= x || bottom <= y) {
    throw new Error(`easy-button pixel-match clip is empty: ${JSON.stringify({ bounds, rect })}`);
  }
  return { height: bottom - y, width: right - x, x, y };
}

export function compareEasyButtonMetrics(production, mockup) {
  const rows = [];
  for (const [key, mockupComponent] of Object.entries(mockup.components)) {
    const productionComponent = production.components[key];
    if (!productionComponent?.exists || !mockupComponent.exists) {
      const productionExists = Boolean(productionComponent?.exists);
      if (productionExists !== mockupComponent.exists) {
        rows.push({
          key,
          kind: "presence",
          mockup: mockupComponent.exists,
          production: productionExists,
        });
      }
      continue;
    }
    rows.push(...styleDeltas(key, productionComponent, mockupComponent));
    rows.push(...rectDeltas(key, productionComponent, mockupComponent));
  }
  rows.push(...tokenDeltas(production, mockup));
  rows.push(...fontDeltas(production, mockup));
  return rows;
}

function tokenDeltas(production, mockup) {
  return Object.entries(mockup.tokens)
    .filter(([role, value]) => production.tokens[role] !== value)
    .map(([role, value]) => ({
      key: `token:${role}`,
      kind: "token",
      mockup: value,
      production: production.tokens[role],
    }));
}

function styleDeltas(key, productionComponent, mockupComponent) {
  return Object.entries(mockupComponent.styles)
    .filter(([property, value]) => productionComponent.styles[property] !== value)
    .map(([property, value]) => ({
      key,
      kind: "style",
      mockup: value,
      production: productionComponent.styles[property],
      property,
    }));
}

const rectModeDimensions = {
  height: ["height"],
  none: [],
  size: ["width", "height"],
  width: ["width"],
};

function rectDeltas(key, productionComponent, mockupComponent) {
  const dimensions = rectModeDimensions[mockupComponent.rectMode];
  if (!dimensions) {
    throw new Error(`easy-button pixel-match rect mode is unknown: ${mockupComponent.rectMode}`);
  }
  return dimensions
    .filter((dimension) => productionComponent.rect[dimension] !== mockupComponent.rect[dimension])
    .map((dimension) => ({
      key,
      kind: "rect",
      mockup: mockupComponent.rect[dimension],
      production: productionComponent.rect[dimension],
      property: dimension,
    }));
}

// `getComputedStyle().fontFamily` reports the requested list, never the face the
// engine picked, so the advance width of a fixed string is the only honest signal
// that two font stacks resolve to the same font.
function fontDeltas(production, mockup) {
  return ["mono", "sans"]
    .filter((role) => production.fonts[role] && mockup.fonts[role])
    .flatMap((role) =>
      ["advancePx", "fontFamily"]
        .filter((property) => production.fonts[role][property] !== mockup.fonts[role][property])
        .map((property) => ({
          key: `font:${role}`,
          kind: "font",
          mockup: mockup.fonts[role][property],
          production: production.fonts[role][property],
          property,
        })),
    );
}

export function formatEasyButtonMetricDeltas(pairLabel, rows) {
  if (rows.length === 0) {
    return `## ${pairLabel}\n\nNo differences.\n`;
  }
  return [
    `## ${pairLabel}`,
    "",
    "| component | kind | property | production | mockup |",
    "| --- | --- | --- | --- | --- |",
    ...rows.map(
      (row) =>
        `| ${row.key} | ${row.kind} | ${row.property ?? "—"} | ${formatCell(row.production)} | ${formatCell(row.mockup)} |`,
    ),
    "",
  ].join("\n");
}

function formatCell(value) {
  if (typeof value === "boolean") {
    return value ? "present" : "absent";
  }
  return String(value).replaceAll("|", "\\|");
}
