import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  productionViewport,
  readCommittedSource,
  runAgainstProductionApp,
} from "./browser-processes.mjs";
import {
  clickElementCenter,
  evaluate,
  labeledSelector,
  navigate,
  pressEscape,
  setEmulatedAppearance,
  textBoxSelector,
  waitFor,
} from "./browser-page.mjs";
import {
  assertCallableFieldParity,
  assertDonorCallableFieldSurface,
  assertDonorGeneratedRegion,
  assertDonorSectionComposition,
  assertGeneratedBlockHugsCode,
  assertGeneratedRegionBoundsItsBody,
  assertNonEditingGeneratedText,
  callableFieldStateScript,
  callableSectionSelector,
  callableSectionStateScript,
  donorCallableField,
  donorGeneratedDocument,
  donorSectionComposition,
  enterCallableField,
  fieldTypeProperties,
  generatedDocumentSelector,
  generatedDocumentStateScript,
  idleCallableSelector,
  liveCallableSelector,
  waitForEnabledCallableField,
} from "./callable-presentation.mjs";

// The visual-acceptance capture: it drives the same production surface as the vertical-slice
// walkthrough and records the four states this presentation correction is judged on — Callable
// idle and focused, Generated Python idle and clicked — in both appearances, as complete section
// crops plus machine-readable geometry and typography. It asserts the donor values while it
// records, so it can never file a capture of a surface that has drifted, but a passing run is
// evidence for review rather than acceptance.
//
// It records the raw first render. An earlier version committed the sample callable and typed a
// parameter value before recording, so the images certified a state the shipped application never
// booted into while the real startup went unexamined. The demo's canonical commit is the Go
// service's own, made before it answers a request.
//
// The crops are whole cards. The developer rejected an earlier bundle because its component
// crops of the callable field hid the composition around them: the card's own padding, the gap
// above the field, and the Args surface below it are exactly what the images have to show.

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const evidenceRoot = path.resolve(
  appRoot,
  "../../docs/evidence/python-canvas-callable-presentation",
);
const appearances = ["light", "dark"];
const callableLabel = "Callable expression";
const parameterLabel = "x expression";
const generatedLabel = "Generated Python generated code, read-only";
// Each crop keeps this much of the surrounding surface so the pill's own border, the generated
// region's rounded ends, and their immediate context are all visible in the image.
const cropMarginCssPx = 8;
// The shipped example the Go service commits before it serves anything. The capture waits for it
// rather than performing it.
const committedCallable = "math.sqrt";

// The canonical first render: the committed callable, its provider-derived parameter row, and the
// generated call. Nothing here mutates the project.
async function waitForCanonicalSectionState(client) {
  await waitFor(
    client,
    "Python Canvas accessible controls",
    `(() => {
      const callable = document.querySelector(${JSON.stringify(textBoxSelector(callableLabel))});
      const generated = document.querySelector(${JSON.stringify(labeledSelector(generatedLabel))});
      const canvas = document.querySelector('[role="region"][aria-label="Workspace canvas"]');
      return callable instanceof HTMLElement && generated instanceof HTMLElement && canvas instanceof HTMLElement;
    })()`,
  );
  await waitForEnabledCallableField(client, callableLabel);
  await waitFor(
    client,
    "the shipped example's committed callable, parameter, and generated call",
    `(() => {
      const callable = document.querySelector(${JSON.stringify(textBoxSelector(callableLabel))});
      const parameter = document.querySelector(${JSON.stringify(textBoxSelector(parameterLabel))});
      const generated = document.querySelector(${JSON.stringify(labeledSelector(generatedLabel))});
      return callable?.textContent === ${JSON.stringify(committedCallable)} &&
        parameter instanceof HTMLElement &&
        generated?.textContent?.includes("state.Square_Root = math.sqrt()") === true;
    })()`,
  );
}

async function captureCrop(client, selector, description) {
  const clip = await evaluate(
    client,
    `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!(element instanceof HTMLElement)) {
        return null;
      }
      const rect = element.getBoundingClientRect();
      const margin = ${String(cropMarginCssPx)};
      const left = Math.max(0, rect.left + window.scrollX - margin);
      const top = Math.max(0, rect.top + window.scrollY - margin);
      return {
        height: Math.min(rect.height + margin * 2, window.innerHeight - top),
        width: Math.min(rect.width + margin * 2, window.innerWidth - left),
        x: left,
        y: top,
      };
    })()`,
  );
  if (clip === null || clip.width <= 0 || clip.height <= 0) {
    throw new Error(`${description} had no visible box to capture.`);
  }
  const screenshot = await client.send("Page.captureScreenshot", {
    captureBeyondViewport: false,
    clip: { ...clip, scale: 1 },
    format: "png",
  });
  return { clip, png: Buffer.from(screenshot.data, "base64") };
}

async function readSurfaceState(client, script, description) {
  const state = await evaluate(client, script);
  if (state === null) {
    throw new Error(`${description} did not render its surface.`);
  }
  return state;
}

// The complete Square Root card in both states, with the card's own composition measured beside
// the field's surface so a field crop can never again stand in for the card around it.
async function captureCallableStates(client, appearance) {
  const idle = await readSurfaceState(
    client,
    callableFieldStateScript(idleCallableSelector(callableLabel)),
    `The idle ${appearance} callable field`,
  );
  assertDonorCallableFieldSurface(idle, appearance);
  const composition = await readSurfaceState(
    client,
    callableSectionStateScript,
    `The ${appearance} Square Root card`,
  );
  assertDonorSectionComposition(composition, appearance);
  const idleCrop = await captureCrop(
    client,
    callableSectionSelector,
    `The idle ${appearance} Square Root card`,
  );

  await enterCallableField(client, callableLabel);
  const focused = await readSurfaceState(
    client,
    callableFieldStateScript(liveCallableSelector(callableLabel)),
    `The focused ${appearance} callable field`,
  );
  // The committed value renders on both layers, so this compares text colour as well as metrics.
  assertCallableFieldParity(idle, focused, fieldTypeProperties, appearance);
  const focusedComposition = await readSurfaceState(
    client,
    callableSectionStateScript,
    `The focused ${appearance} Square Root card`,
  );
  assertDonorSectionComposition(focusedComposition, appearance);
  const focusedCrop = await captureCrop(
    client,
    callableSectionSelector,
    `The focused ${appearance} Square Root card`,
  );

  await pressEscape(client);
  await waitFor(
    client,
    "the callable field returning to its idle layer",
    `document.querySelector(${JSON.stringify(liveCallableSelector(callableLabel))}) === null`,
  );

  return [
    {
      crop: idleCrop,
      observed: { composition, field: idle },
      state: "idle",
    },
    {
      crop: focusedCrop,
      observed: { composition: focusedComposition, field: focused },
      state: "focused",
    },
  ];
}

async function captureGeneratedStates(client, appearance) {
  const idle = await readSurfaceState(
    client,
    generatedDocumentStateScript,
    `The idle ${appearance} generated Python region`,
  );
  assertDonorGeneratedRegion(idle, appearance);
  assertGeneratedBlockHugsCode(`The idle ${appearance}`, idle);
  assertGeneratedRegionBoundsItsBody(`The idle ${appearance}`, idle);
  assertNonEditingGeneratedText(`The idle ${appearance}`, idle);
  const idleCrop = await captureCrop(
    client,
    generatedDocumentSelector,
    `The idle ${appearance} generated Python region`,
  );

  await clickElementCenter(
    client,
    generatedDocumentSelector,
    `The ${appearance} generated Python region`,
  );
  const clicked = await readSurfaceState(
    client,
    generatedDocumentStateScript,
    `The clicked ${appearance} generated Python region`,
  );
  assertDonorGeneratedRegion(clicked, appearance);
  assertGeneratedBlockHugsCode(`The clicked ${appearance}`, clicked);
  assertGeneratedRegionBoundsItsBody(`The clicked ${appearance}`, clicked);
  assertNonEditingGeneratedText(`The clicked ${appearance}`, clicked);
  const clickedCrop = await captureCrop(
    client,
    generatedDocumentSelector,
    `The clicked ${appearance} generated Python region`,
  );

  return [
    { crop: idleCrop, observed: idle, state: "idle" },
    { crop: clickedCrop, observed: clicked, state: "clicked" },
  ];
}

function writeCapture(records, surface, appearance, entry) {
  const ordinal = String(records.length + 1).padStart(2, "0");
  const id = `${ordinal}-${surface}-${entry.state}-${appearance}`;
  const file = `${id}-1440x900.png`;
  writeFileSync(path.join(evidenceRoot, "screenshots", file), entry.crop.png);
  records.push({
    appearance,
    crop: { ...entry.crop.clip, marginCssPx: cropMarginCssPx },
    donor:
      surface === "callable-section"
        ? {
            composition: donorSectionComposition,
            field: donorCallableField[appearance],
          }
        : donorGeneratedDocument[appearance],
    id,
    observed: entry.observed,
    screenshot: `screenshots/${file}`,
    screenshotSha256: createHash("sha256").update(entry.crop.png).digest("hex"),
    state: entry.state,
    surface,
  });
}

async function capture(client, previewOrigin) {
  const records = [];
  for (const appearance of appearances) {
    // Load into the appearance so both passes start from the same boot path with nothing focused,
    // selected, or mid-transition.
    await setEmulatedAppearance(client, appearance);
    await navigate(client, previewOrigin);
    await waitForCanonicalSectionState(client);

    const callable = await captureCallableStates(client, appearance);
    const generated = await captureGeneratedStates(client, appearance);
    for (const entry of callable) {
      writeCapture(records, "callable-section", appearance, entry);
    }
    for (const entry of generated) {
      writeCapture(records, "generated-document", appearance, entry);
    }
  }
  return records;
}

async function main() {
  // Evidence has to name the exact source it came from, so this refuses to record a capture of a
  // tree that no commit describes.
  const sourceCommit = readCommittedSource();
  const capturedAt = new Date().toISOString();
  // A re-run replaces the images and the metrics it owns. The bundle's prose is written by hand
  // beside them and must survive.
  rmSync(path.join(evidenceRoot, "screenshots"), {
    force: true,
    recursive: true,
  });
  mkdirSync(path.join(evidenceRoot, "screenshots"), { recursive: true });
  mkdirSync(path.join(evidenceRoot, "computed"), { recursive: true });

  let captures = [];
  let browserVersion = "";
  await runAgainstProductionApp(async ({ client, previewOrigin }) => {
    const version = await client.send("Browser.getVersion");
    browserVersion = version.product;
    captures = await capture(client, previewOrigin);
  });

  writeFileSync(
    path.join(evidenceRoot, "computed", "presentation-metrics.json"),
    `${JSON.stringify(
      {
        capture: {
          appearances,
          browser: browserVersion,
          capturedAt,
          committedCallable,
          cropMarginCssPx,
          sourceCommit,
          surface:
            "Production @setta/workspace and Python Canvas builds served by vite preview, the real Go service, and its pinned Basedpyright.",
          viewport: productionViewport,
        },
        comparison: {
          donorReferenceImages: [
            "docs/evidence/phase0/reference/screenshots/27-root-callable-selected-with-params-light.png",
            "docs/evidence/phase0/reference/screenshots/25-root-callable-selected-with-params-dark.png",
          ],
          donorSources: [
            "frontend/src/components/Section/SectionParts/Search.tsx",
            "frontend/src/components/Section/Layouts/CodeArea.tsx",
          ],
          geometryToleranceCssPx: 1,
          pixelDiffTolerance: null,
        },
        captures,
      },
      null,
      2,
    )}\n`,
  );
  console.log(
    `Recorded ${String(captures.length)} Python Canvas presentation captures at ${sourceCommit}.`,
  );
}

await main();
