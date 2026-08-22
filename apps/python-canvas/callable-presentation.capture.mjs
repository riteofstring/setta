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
  insertText,
  labeledSelector,
  navigate,
  pressEscape,
  selectAll,
  setEmulatedAppearance,
  textBoxSelector,
  waitFor,
} from "./browser-page.mjs";
import {
  assertCallableFieldParity,
  assertCompletionPopupEscapesTheSection,
  assertDonorCallableFieldSurface,
  assertDonorGeneratedRegion,
  assertDonorSectionComposition,
  assertGeneratedBlockHugsCode,
  assertGeneratedRegionBoundsItsBody,
  assertAuthorableGeneratedDocument,
  assertSettledCardIsInsideCanvas,
  assertSettledSectionIsNotPromoted,
  callableCompletionPopupSelector,
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
  readPlacedCallableCompletionPopup,
  readSettledSectionState,
  settledSectionCompositing,
  waitForCallableCompletion,
  waitForCallableDraft,
  waitForClosedCallableCompletion,
  waitForEnabledCallableField,
  waitForIdleCallableValue,
  zoomCanvasOnCallableCard,
} from "./callable-presentation.mjs";

// The visual-acceptance capture: it drives the same production surface as the vertical-slice
// walkthrough and records the states this presentation correction is judged on — Callable idle and
// focused, Generated Python idle and clicked, and the settled enlarged zoom the developer exercised
// it at, idle, focused, and with a completion popup open — in both appearances, as complete section
// crops plus machine-readable geometry, typography, and settled compositing. It asserts the donor
// values while it records, so it can never file a capture of a surface that has drifted, but a
// passing run is evidence for review rather than acceptance.
//
// It records the raw first render. An earlier version committed the sample callable and typed a
// parameter value before recording, so the images certified a state the shipped application never
// booted into while the real startup went unexamined. The demo's canonical commit is the Go
// service's own, made before it answers a request.
//
// The crops are whole cards. The developer rejected an earlier bundle because its component
// crops of the callable field hid the composition around them: the card's own padding, the gap
// above the field, and the Args surface below it are exactly what the images have to show. The
// supervisor then rejected the enlarged images for the same reason arrived at differently — the
// gesture had pushed the card's header out of the canvas and the crop was truncated at the
// viewport edge — so the enlarged sequence starts from a freshly loaded scene and no crop is ever
// clamped into a plausible partial image.

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const evidenceRoot = path.resolve(
  appRoot,
  "../../docs/evidence/python-canvas-callable-presentation",
);
const appearances = ["light", "dark"];
const callableLabel = "Callable expression";
const parameterLabel = "x expression";
const generatedLabel =
  "Generated Python code editor, generated output read-only";
// Each crop keeps this much of the surrounding surface so the pill's own border, the generated
// region's rounded ends, and their immediate context are all visible in the image.
const cropMarginCssPx = 8;
// The shipped example the Go service commits before it serves anything. The capture waits for it
// rather than performing it.
const committedCallable = "math.sqrt";
// The draft the zoomed completion state is recorded on, and the offer the provider answers with.
// Escape abandons it, so the recording still mutates nothing.
const completionDraft = "math.sq";
const completionLabel = "sqrt";

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

// The crop covers every element it is given, plus the margin, and it is never clamped to the
// viewport. The supervisor rejected an enlarged bundle whose cards had been truncated at the
// viewport edge into plausible-looking partial images, so a subject that does not fit on screen is
// a defect in the state being recorded and fails here instead of being photographed in part.
async function captureCrop(client, selectors, description) {
  const measured = await evaluate(
    client,
    `(() => {
      const elements = ${JSON.stringify(selectors)}.map((selector) => document.querySelector(selector));
      if (!elements.every((element) => element instanceof HTMLElement)) {
        return null;
      }
      const boxes = elements.map((element) => element.getBoundingClientRect());
      const margin = ${String(cropMarginCssPx)};
      const left = Math.min(...boxes.map((box) => box.left)) - margin;
      const top = Math.min(...boxes.map((box) => box.top)) - margin;
      const right = Math.max(...boxes.map((box) => box.right)) + margin;
      const bottom = Math.max(...boxes.map((box) => box.bottom)) + margin;
      return {
        clip: {
          height: bottom - top,
          width: right - left,
          x: left + window.scrollX,
          y: top + window.scrollY,
        },
        offscreen: Object.entries({
          bottom: bottom - window.innerHeight,
          left: -left,
          right: right - window.innerWidth,
          top: -top,
        }).filter(([, overflow]) => overflow > 0.5),
      };
    })()`,
  );
  if (measured === null) {
    throw new Error(`${description} had no visible box to capture.`);
  }
  if (measured.offscreen.length > 0) {
    const edges = measured.offscreen
      .map(
        ([edge, overflow]) =>
          `${String(Math.round(overflow))} CSS px past its ${edge}`,
      )
      .join(", ");
    throw new Error(
      `${description} reaches outside the ${String(productionViewport.width)}x${String(productionViewport.height)} viewport by ${edges}, so no complete image of it exists to record.`,
    );
  }
  if (measured.clip.width <= 0 || measured.clip.height <= 0) {
    throw new Error(`${description} had no visible box to capture.`);
  }
  const screenshot = await client.send("Page.captureScreenshot", {
    captureBeyondViewport: false,
    clip: { ...measured.clip, scale: 1 },
    format: "png",
  });
  return { clip: measured.clip, png: Buffer.from(screenshot.data, "base64") };
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
    [callableSectionSelector],
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
    [callableSectionSelector],
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

// The states the developer rejected the previous candidate on: a settled enlarged zoom, where the
// package's own compositor layer blurred everything the card paints, and the focused field with a
// completion popup open, where the section's clipping box cropped that popup to a horizontal line
// across the pill. The card is recorded idle, focused, and with the popup showing, and the
// section's settled compositing is recorded beside each image.
async function captureZoomedStates(client, previewOrigin, appearance) {
  // The enlarged sequence starts from the scene the service boots, not from whatever the 1x
  // recordings above left focused, clicked, or selected: the gesture's landing place depends on
  // where the card is when it arrives.
  await navigate(client, previewOrigin);
  await waitForCanonicalSectionState(client);

  const idleSection = await zoomCanvasOnCallableCard(client);
  assertSettledSectionIsNotPromoted(
    `The idle ${appearance} zoomed`,
    idleSection,
  );
  // The complete enlarged card has to be on screen before anything photographs it: the rejected
  // bundle's cards had ridden up under the application's status strip and were recorded in part.
  assertSettledCardIsInsideCanvas(`The idle ${appearance} zoomed`, idleSection);
  const idleField = await readSurfaceState(
    client,
    callableFieldStateScript(idleCallableSelector(callableLabel)),
    `The idle ${appearance} zoomed callable field`,
  );
  // Computed paint and type do not scale with the canvas transform, so the donor surface has to
  // hold at an enlarged zoom exactly as it does at 1x.
  assertDonorCallableFieldSurface(idleField, appearance);
  const idleCrop = await captureCrop(
    client,
    [callableSectionSelector],
    `The idle ${appearance} zoomed Square Root card`,
  );

  await enterCallableField(client, callableLabel);
  const focusedField = await readSurfaceState(
    client,
    callableFieldStateScript(liveCallableSelector(callableLabel)),
    `The focused ${appearance} zoomed callable field`,
  );
  assertCallableFieldParity(
    idleField,
    focusedField,
    fieldTypeProperties,
    appearance,
  );
  const focusedSection = await readSettledSectionState(
    client,
    `The focused ${appearance} zoomed`,
  );
  assertSettledSectionIsNotPromoted(
    `The focused ${appearance} zoomed`,
    focusedSection,
  );
  assertSettledCardIsInsideCanvas(
    `The focused ${appearance} zoomed`,
    focusedSection,
  );
  const focusedCrop = await captureCrop(
    client,
    [callableSectionSelector],
    `The focused ${appearance} zoomed Square Root card`,
  );

  // The field is already the live editor this pass focused, so the draft is replaced in it rather
  // than entered again from an idle layer this state no longer has.
  await selectAll(client);
  await insertText(client, completionDraft);
  await waitForCallableDraft(client, callableLabel, completionDraft);
  await waitForCallableCompletion(client, completionLabel);
  const popup = await readPlacedCallableCompletionPopup(
    client,
    `The ${appearance} zoomed`,
  );
  assertCompletionPopupEscapesTheSection(`The ${appearance} zoomed`, popup);
  // The popup is joined to the card here, because this image has to show the whole list the
  // rejected placement cropped down to a line across the pill.
  const completionCrop = await captureCrop(
    client,
    [callableSectionSelector, callableCompletionPopupSelector],
    `The ${appearance} zoomed Square Root card with its completion popup`,
  );

  // The popup takes the first Escape and the abandoned draft returns to the committed value on the
  // second, so this recording leaves the project exactly as it found it.
  await pressEscape(client);
  await waitForClosedCallableCompletion(client);
  await pressEscape(client);
  await waitForIdleCallableValue(client, callableLabel, committedCallable);

  return [
    {
      crop: idleCrop,
      observed: { field: idleField, section: idleSection },
      state: "zoomed-idle",
    },
    {
      crop: focusedCrop,
      observed: { field: focusedField, section: focusedSection },
      state: "zoomed-focused",
    },
    {
      crop: completionCrop,
      observed: { popup, section: focusedSection },
      state: "zoomed-completion",
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
  assertAuthorableGeneratedDocument(`The idle ${appearance}`, idle);
  const idleCrop = await captureCrop(
    client,
    [generatedDocumentSelector],
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
  assertAuthorableGeneratedDocument(`The clicked ${appearance}`, clicked);
  const clickedCrop = await captureCrop(
    client,
    [generatedDocumentSelector],
    `The clicked ${appearance} generated Python region`,
  );

  return [
    { crop: idleCrop, observed: idle, state: "idle" },
    { crop: clickedCrop, observed: clicked, state: "clicked" },
  ];
}

function donorValuesFor(surface, appearance) {
  if (surface === "generated-document") {
    return donorGeneratedDocument[appearance];
  }
  if (surface === "zoomed-callable-section") {
    return {
      compositing: settledSectionCompositing,
      field: donorCallableField[appearance],
    };
  }
  return {
    composition: donorSectionComposition,
    field: donorCallableField[appearance],
  };
}

function writeCapture(records, surface, appearance, entry) {
  const ordinal = String(records.length + 1).padStart(2, "0");
  const id = `${ordinal}-${surface}-${entry.state}-${appearance}`;
  const file = `${id}-1440x900.png`;
  writeFileSync(path.join(evidenceRoot, "screenshots", file), entry.crop.png);
  records.push({
    appearance,
    crop: { ...entry.crop.clip, marginCssPx: cropMarginCssPx },
    donor: donorValuesFor(surface, appearance),
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
    // Last, because the gesture enlarges the scene every state above is measured in.
    const zoomed = await captureZoomedStates(client, previewOrigin, appearance);
    for (const entry of callable) {
      writeCapture(records, "callable-section", appearance, entry);
    }
    for (const entry of generated) {
      writeCapture(records, "generated-document", appearance, entry);
    }
    for (const entry of zoomed) {
      writeCapture(records, "zoomed-callable-section", appearance, entry);
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
