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
  activateTextBox,
  clickElementCenter,
  evaluate,
  insertText,
  labeledSelector,
  navigate,
  pressEnter,
  pressEscape,
  setEmulatedAppearance,
  textBoxSelector,
  waitFor,
} from "./browser-page.mjs";
import {
  assertCallableFieldParity,
  assertDonorCallableFieldSurface,
  assertDonorGeneratedRegion,
  assertNonEditingGeneratedText,
  callableFieldStateScript,
  donorCallableField,
  donorGeneratedOutput,
  enterCallableField,
  fieldValueTypeProperties,
  generatedOutputSelector,
  generatedOutputStateScript,
  idleCallableSelector,
  liveCallableSelector,
  sectionFieldSelector,
  selectSqrtCompletion,
  waitForEnabledCallableField,
} from "./callable-presentation.mjs";

// The visual-acceptance capture: it drives the same production surface as the vertical-slice
// walkthrough, puts the Square Root section into its ordinary committed state, and records the
// four states this presentation correction is judged on — Callable idle and focused, Generated
// Python idle and clicked — in both appearances, as component crops plus machine-readable geometry
// and typography. It asserts the donor values while it records, so it can never file a capture of
// a surface that has drifted, but a passing run is evidence for review rather than acceptance.

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
const committedCallable = "math.sqrt";
const committedParameter = "3";

async function waitForLoadedSection(client) {
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
}

// The state the section spends its life in: a committed callable and a real parameter value, which
// is also the state main's reference captures show.
async function commitOrdinarySectionState(client) {
  await selectSqrtCompletion(client, callableLabel);
  await pressEnter(client);
  await waitFor(
    client,
    "the committed callable projecting its parameter",
    `(() => {
      const parameter = document.querySelector(${JSON.stringify(textBoxSelector(parameterLabel))});
      return parameter instanceof HTMLElement && parameter.getAttribute("aria-disabled") !== "true";
    })()`,
  );
  await activateTextBox(client, parameterLabel);
  await insertText(client, committedParameter);
  await waitFor(
    client,
    "the parameter value reaching generated Python",
    `document.querySelector(${JSON.stringify(labeledSelector(generatedLabel))})?.textContent?.includes(
      "state.Square_Root__x = ${committedParameter}",
    ) === true`,
  );
}

async function waitForCommittedSectionState(client) {
  await waitForLoadedSection(client);
  await waitFor(
    client,
    "the committed callable and parameter after reload",
    `(() => {
      const callable = document.querySelector(${JSON.stringify(textBoxSelector(callableLabel))});
      const generated = document.querySelector(${JSON.stringify(labeledSelector(generatedLabel))});
      return callable?.textContent === ${JSON.stringify(committedCallable)} &&
        generated?.textContent?.includes("state.Square_Root__x = ${committedParameter}") === true;
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

async function captureCallableStates(client, appearance) {
  const idle = await readSurfaceState(
    client,
    callableFieldStateScript(idleCallableSelector(callableLabel)),
    `The idle ${appearance} callable field`,
  );
  assertDonorCallableFieldSurface(idle, appearance);
  const idleCrop = await captureCrop(
    client,
    sectionFieldSelector,
    `The idle ${appearance} callable field`,
  );

  await enterCallableField(client, callableLabel);
  const focused = await readSurfaceState(
    client,
    callableFieldStateScript(liveCallableSelector(callableLabel)),
    `The focused ${appearance} callable field`,
  );
  // The committed value renders on both layers, so this compares text colour as well as metrics.
  assertCallableFieldParity(
    idle,
    focused,
    fieldValueTypeProperties,
    appearance,
  );
  const focusedCrop = await captureCrop(
    client,
    sectionFieldSelector,
    `The focused ${appearance} callable field`,
  );

  await pressEscape(client);
  await waitFor(
    client,
    "the callable field returning to its idle layer",
    `document.querySelector(${JSON.stringify(liveCallableSelector(callableLabel))}) === null`,
  );

  return [
    { crop: idleCrop, observed: idle, state: "idle" },
    { crop: focusedCrop, observed: focused, state: "focused" },
  ];
}

async function captureGeneratedStates(client, appearance) {
  const idle = await readSurfaceState(
    client,
    generatedOutputStateScript,
    `The idle ${appearance} generated Python region`,
  );
  assertDonorGeneratedRegion(idle, appearance);
  assertNonEditingGeneratedText(`The idle ${appearance}`, idle);
  const idleCrop = await captureCrop(
    client,
    generatedOutputSelector,
    `The idle ${appearance} generated Python region`,
  );

  await clickElementCenter(
    client,
    generatedOutputSelector,
    `The ${appearance} generated Python region`,
  );
  const clicked = await readSurfaceState(
    client,
    generatedOutputStateScript,
    `The clicked ${appearance} generated Python region`,
  );
  assertDonorGeneratedRegion(clicked, appearance);
  assertNonEditingGeneratedText(`The clicked ${appearance}`, clicked);
  const clickedCrop = await captureCrop(
    client,
    generatedOutputSelector,
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
      surface === "callable-field"
        ? donorCallableField[appearance]
        : donorGeneratedOutput[appearance],
    id,
    observed: entry.observed,
    screenshot: `screenshots/${file}`,
    screenshotSha256: createHash("sha256").update(entry.crop.png).digest("hex"),
    state: entry.state,
    surface,
  });
}

async function capture(client, previewOrigin) {
  await setEmulatedAppearance(client, appearances[0]);
  await navigate(client, previewOrigin);
  await waitForLoadedSection(client);
  await commitOrdinarySectionState(client);

  const records = [];
  for (const appearance of appearances) {
    // Reload into the appearance so both passes start from the same boot path with nothing
    // focused, selected, or mid-transition.
    await setEmulatedAppearance(client, appearance);
    await navigate(client, previewOrigin);
    await waitForCommittedSectionState(client);

    const callable = await captureCallableStates(client, appearance);
    const generated = await captureGeneratedStates(client, appearance);
    for (const entry of callable) {
      writeCapture(records, "callable-field", appearance, entry);
    }
    for (const entry of generated) {
      writeCapture(records, "generated-output", appearance, entry);
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
          committedParameter,
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
