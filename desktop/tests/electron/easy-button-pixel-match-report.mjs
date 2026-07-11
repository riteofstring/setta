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

export const synchronizedCaptureText =
  "Compare the three swirl approaches and show me which one is cheapest to paint.";
export const synchronizedCaptureFailureText =
  "The transcription connection was lost. Please try again.";
const synchronizedFixtureFields = [
  "agentChipText",
  "artifactCount",
  "currentFocusText",
  "focusLabelText",
  "focusStatus",
  "helperText",
  "highlights",
  "inputPlaceholder",
  "narratorStatusText",
  "outputMode",
  "playback",
  "statusTone",
  "summaryText",
];

export const pixelMatchSpeechCapturePlan = [
  { crops: ["audioToggle", "control", "inputWrap"], state: "idle" },
  {
    crops: ["audioToggle", "captionSlot", "control"],
    state: "requestingPermission",
  },
  { crops: ["audioToggle", "captionSlot", "control"], state: "connecting" },
  {
    crops: ["audioToggle", "captureLine", "captionSlot", "control", "rings"],
    state: "listening",
  },
  {
    crops: ["audioToggle", "captureLine", "captionSlot", "control", "rings"],
    state: "committing",
  },
  { crops: ["audioToggle", "captionSlot", "control"], state: "captureFailure" },
];

export const pixelMatchCapturePlan = [
  ...pixelMatchSpeechCapturePlan,
  {
    crops: ["actionSlot", "audioToggle", "captionSlot", "control", "stopButton", "swirl"],
    state: "working",
  },
  { crops: ["audioToggle", "captionSlot", "highlightItem"], state: "stopped" },
  {
    // artifactCard is not an image-diff target: the mockup card is illustrative
    // (its .a-plate SVG diagram and .winner table row have no production
    // counterpart), so its body pixels are intentionally different — comparing
    // them would report the mockup's demo content as a production regression.
    // The shared artifact shell, kicker, title, table, bar-chart, and inset
    // styling are still compared as computed-style/geometry deltas in the
    // metric report, which measures those roles on both surfaces.
    crops: ["audioToggle", "inputWrap", "summaryReplay"],
    state: "completedArtifacts",
  },
  {
    crops: ["audioToggle", "captionSlot", "highlightItem", "summaryReplay"],
    state: "completedHighlights",
  },
  // artifactCard excluded from image crops for the same reason as
  // completedArtifacts; its styling stays in the metric-delta report.
  { crops: ["audioToggle", "control", "summaryReplay"], state: "failed" },
];

// The pane cannot show both rails at once — no scripted run emits highlights and
// artifacts together — so the two `completed` frames split them. Every captured
// state now has a same-named mockup fixture; deriving the pairs from the owned
// plan prevents a new state from being captured without entering the comparison.
export const metricPairs = pixelMatchCapturePlan.map(({ state }) => ({
  mockup: state,
  production: state,
}));

export function requireSynchronizedVisualFixture(fixture, label) {
  if (!fixture || typeof fixture !== "object" || Array.isArray(fixture)) {
    throw new Error(`easy-button ${label} metrics have no synchronized fixture`);
  }
  const missingFields = synchronizedFixtureFields.filter(
    (field) => !(field in fixture) || fixture[field] === undefined,
  );
  if (missingFields.length > 0) {
    throw new Error(`easy-button ${label} fixture is missing fields: ${missingFields.join(", ")}`);
  }
  return fixture;
}

export async function writePng(path, base64) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, Buffer.from(base64, "base64"));
}

// The swirl is three times the width of the button well and the stage clips it,
// so its own rect runs outside the pane. A screenshot clip may not.
//
// Clips are snapped to whole pixels, but size and origin are snapped
// independently. The earlier `ceil(left) … floor(right)` coupled a crop's width
// to the sub-pixel phase of its origin: the same 180px control measured at
// x=100.4 on one surface and x=200.6 on the other produced a 179px and a 180px
// crop, and the comparator then flagged a phantom dimension mismatch for two
// identical boxes. Rounding the extent (`right - left`) instead gives the crop
// the box's own rounded size wherever it sits, so equal boxes yield equal-size
// crops on both surfaces; only a genuine >=1px box-size difference (the swirl,
// an over-long capture line) survives as a real dimension mismatch. A fractional
// origin still lands the content on a slightly different subpixel grid — that
// residual is antialiasing noise, measured and bounded later, not a size delta.
export function clipToBounds(rect, bounds) {
  const left = Math.max(rect.x, bounds.x);
  const top = Math.max(rect.y, bounds.y);
  const right = Math.min(rect.x + rect.width, bounds.x + bounds.width);
  const bottom = Math.min(rect.y + rect.height, bounds.y + bounds.height);
  const width = Math.round(right - left);
  const height = Math.round(bottom - top);
  if (width <= 0 || height <= 0) {
    throw new Error(`easy-button pixel-match clip is empty: ${JSON.stringify({ bounds, rect })}`);
  }
  return { height, width, x: Math.round(left), y: Math.round(top) };
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

// Differences the plan accepts on purpose. They stay visible in the report as
// classified rows so no unknown delta can hide behind them, but they do not
// count as unexplained. `token:accentMagenta` is the plan's single sanctioned
// token divergence; every other role is required to match exactly.
const intentionalDivergences = {
  "token:accentMagenta":
    "the plan accepts the magenta token's oklch divergence; every other token matches",
};

function tokenDeltas(production, mockup) {
  return Object.entries(mockup.tokens)
    .filter(([role, value]) => production.tokens[role] !== value)
    .map(([role, value]) => ({
      key: `token:${role}`,
      kind: "token",
      mockup: value,
      note: intentionalDivergences[`token:${role}`] ?? "",
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
  const unexplained = rows.filter((row) => !row.note);
  const intentional = rows.filter((row) => row.note);
  return [
    `## ${pairLabel}`,
    "",
    `Unexplained deltas: ${unexplained.length}. Intentional (classified): ${intentional.length}.`,
    "",
    "| component | kind | property | production | mockup | classification |",
    "| --- | --- | --- | --- | --- | --- |",
    ...unexplained.map((row) => formatDeltaRow(row, "unexplained")),
    ...intentional.map((row) => formatDeltaRow(row, `intentional — ${row.note}`)),
    "",
  ].join("\n");
}

function formatDeltaRow(row, classification) {
  return `| ${row.key} | ${row.kind} | ${row.property ?? "—"} | ${formatCell(row.production)} | ${formatCell(row.mockup)} | ${classification} |`;
}

function formatCell(value) {
  if (typeof value === "boolean") {
    return value ? "present" : "absent";
  }
  return String(value).replaceAll("|", "\\|");
}
