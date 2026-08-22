import { setTimeout as delay } from "node:timers/promises";

import {
  clickElementCenter,
  elementCenter,
  evaluate,
  insertText,
  movePointerTo,
  pinchZoomCanvas,
  selectAll,
  textBoxSelector,
  waitFor,
} from "./browser-page.mjs";

// The two package-owned surfaces this presentation correction is about: the section-field callable
// editor inside its complete section card, and the generated-document Code section. This module
// owns the donor values each one must paint in each appearance, the page-side reads that observe
// them, and the callable commit that puts the section into its ordinary committed state. The
// production walkthrough proves them in the appearance it runs in and the capture harness records
// both, so a donor value has one owner.
//
// Every selector here is an accessible name or role, a documented package hook, an HTML landmark,
// or this app's own content. The one sanctioned exception is the pair of negative `.cm-cursor` and
// `.cm-activeLine` reads below: they assert those layers are absent, so they need no editor
// internal to exist, and their absence is the only DOM evidence that no caret is drawn.

const sectionFieldSelector = "[data-workspace-section-field]";
export const callableSectionSelector =
  '[role="group"][aria-label^="Square Root section"]';
export const itemToolbarSelector = "[data-workspace-item-toolbar]";
// The canvas the scene is drawn in, by its own accessible role and name, and the popup the
// completion state has to show whole.
const workspaceCanvasSelector =
  '[role="region"][aria-label="Workspace canvas"]';
export const callableCompletionPopupSelector = '[role="listbox"]';
// The card's own header landmark, and the app's own first parameter label below the toolbar.
const sectionHeaderSelector = `${callableSectionSelector} header`;
export const firstParameterSelector = ".python-canvas-parameter-label";
export const generatedDocumentSelector =
  '[data-workspace-section-editor="generated-document"]';
// The block's own lines and its two ends, through the package's documented per-line hook. A region
// that begins and ends on one line is both ends at once.
const generatedBlockLineSelector = "[data-workspace-generated-line]";
const generatedBlockStartSelector =
  '[data-workspace-generated-line="start"], [data-workspace-generated-line="only"]';
const generatedBlockEndSelector =
  '[data-workspace-generated-line="end"], [data-workspace-generated-line="only"]';

// The canonical document's authored prefix and suffix. The Go response owns them, the reader shows
// them, and the declared region must not claim either as generated output.
const authoredGeneratedLines = ["import math", "state = SettaState()"];

// The section is fixed at 390 CSS px and its generated document is seven short lines, so a block
// that hugs the code leaves most of the section unpainted. The rejected candidate painted all of
// it, and this is the margin that tells the two apart without pinning the document's own length.
const unpaintedSectionHeightCssPx = 100;

// Main's card is a continuous header → field → Args → parameters stack. The package's own grid,
// toolbar, and item list supply the only steps in it, so these are the whole composition's spacing
// budget: the field begins at the header's boundary, the Args surface begins at the field's own
// boundary because main's Callable toolbar is `mt-0 pb-0` where an ordinary one is `mt-1 pb-1`,
// the item list keeps the package's own step below the toolbar, and the field spans the card with
// nothing but its own 2px inline margin. The rejected candidates added this app's 14px content
// padding, an invented block gap above the field, and the ordinary toolbar's 4px step below it.
export const donorSectionComposition = {
  fieldToToolbarCssPx: 0,
  headerToFieldCssPx: 0,
  sectionToFieldInlineCssPx: 2,
  toolbarToFirstParameterCssPx: 8,
};
const compositionToleranceCssPx = 1;

// The activation swap may move the field's own box by less than a device pixel of rounding, but
// not by a layout step.
const fieldGeometryToleranceCssPx = 1;

// The shipped demo commits its callable before its first response, so this field always renders a
// real value on both layers and text colour is compared with the rest of its type.
export const fieldTypeProperties = [
  "color",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
];

// Frozen main's callable field (`SectionSearch`), as the package's scoped stylesheet ports it:
// one 16px-radius pill with a one-pixel border, 4px block and 10px inline padding, 2px inline
// margin, and main's white/`setta-950` field colours over its `setta-100`/`setta-800` borders.
// Activation changes the border colour to main's focus blue and nothing else.
export const donorCallableField = {
  dark: {
    borderColor: "rgb(26, 33, 45)",
    // Chromium serializes the donor's 50% focus alpha from its eight-bit channel.
    focusBorderColor: "rgba(96, 165, 250, 0.498)",
    surface: {
      backgroundColor: "rgb(6, 7, 10)",
      borderRadius: "16px",
      borderWidth: "1px",
      marginInline: "2px 2px",
      padding: "4px 10px 4px 10px",
    },
  },
  light: {
    borderColor: "rgb(220, 225, 234)",
    focusBorderColor: "rgb(59, 130, 246)",
    surface: {
      backgroundColor: "rgb(255, 255, 255)",
      borderRadius: "16px",
      borderWidth: "1px",
      marginInline: "2px 2px",
      padding: "4px 10px 4px 10px",
    },
  },
};

// Frozen main's `GEN_CODE_READONLY_THEME`: the blue-tinted region behind a three-pixel leading
// rail, six-pixel rounded ends, and the compact uppercase badge — painted on the lines the
// declared region covers, so these are the block's own values rather than the editor wrapper's.
// Chromium expands the rail's double-position stop into its two computed stops.
export const donorGeneratedDocument = {
  dark: {
    badge: {
      backgroundColor: "rgb(30, 64, 175)",
      content: '"Generated read-only"',
      textTransform: "uppercase",
    },
    region: {
      backgroundImage:
        "linear-gradient(90deg, rgb(37, 99, 235) 0px, rgb(37, 99, 235) 3px, rgb(23, 37, 84) 3px)",
      borderRadius: "6px",
    },
  },
  light: {
    badge: {
      backgroundColor: "rgb(37, 99, 235)",
      content: '"Generated read-only"',
      textTransform: "uppercase",
    },
    region: {
      backgroundImage:
        "linear-gradient(90deg, rgb(96, 165, 250) 0px, rgb(96, 165, 250) 3px, rgb(219, 234, 254) 3px)",
      borderRadius: "6px",
    },
  },
};

// Main hangs the badge off the generated block's own upper boundary, centred over the block, and
// that placement is the same in both appearances. The rejected candidate pinned it to the top
// corner of the editor wrapper instead. Chromium resolves a pseudo-element's inline start to used
// pixels, so the centring is compared against the block's measured box rather than to "50%".
const badgeCentreToleranceCssPx = 3;

// The developer rejected a candidate whose settled zoomed section was blurred by a compositor
// layer the package kept on every hovered section. A settled section owns no layer of its own, so
// the browser rasterizes it at the zoom it is displayed at instead of scaling a picture the
// gesture left behind. These are the section's own computed values, read from the accessible group
// the card already exposes.
export const settledSectionCompositing = {
  backfaceVisibility: "visible",
  isolation: "auto",
  transform: "none",
  willChange: "auto",
};

// One real pinch step on this canvas doubles the scene, which is an enlargement a blurred layer
// would be plainly visible at. The gesture is proved by the card's own measured growth rather than
// by the input having been dispatched.
const zoomWheelDelta = -50;
const minimumZoomedCardGrowth = 1.5;
// An enlarged card has to stay inside the canvas it is drawn in, because a card that leaves it
// rides under the application's own status strip and no complete image of it exists. The section's
// selection stroke sits just outside its box, so containment allows for that stroke and for nothing
// resembling a clipped header or parameter row.
const cardInsideCanvasToleranceCssPx = 2;
// The scene settles as soon as d3 applies the wheel, but the package's own gesture marker outlives
// it by 180 ms. This is comfortably longer, so what the harness measures and captures is the
// settled state rather than the tail of a gesture.
const zoomSettleMs = 900;

// A completion popup that is still inside the section's clipped box survives as the one horizontal
// line the section does not crop — the inner rule the developer saw across the focused pill. The
// popup below is proved to be out of that box in three public ways: it is not in the section's
// subtree, its box reaches past the field's own bottom edge, and the page hit-tests it where a
// clipped popup would have nothing to hit.
const popupBelowFieldCssPx = 8;

export function idleCallableSelector(callableLabel) {
  return `${textBoxSelector(callableLabel)}:not([contenteditable="true"])`;
}

export function liveCallableSelector(callableLabel) {
  return `${textBoxSelector(callableLabel)}[contenteditable="true"]`;
}

// The settled field: its idle layer, enabled. Two things unsettle it. The provider's initial work
// leaves the field disabled, and leaving a live editor swaps the idle layer back from a timer
// rather than during the blur itself — main's own `TextInputCodeMirror` defers that teardown to
// keep CodeMirror from blocking the next input, and this package keeps main's lifecycle. So a step
// that follows a keyboard or pointer exit can arrive while the blurred live layer is still the only
// one mounted. Both are the field settling rather than a field a reader could act on, so every step
// that enters or measures the idle surface waits for the surface it actually names.
export async function waitForIdleCallableField(client, callableLabel) {
  await waitFor(
    client,
    "the enabled idle callable editor after initial provider work and any pending editor teardown",
    `(() => {
      const idle = document.querySelector(${JSON.stringify(idleCallableSelector(callableLabel))});
      return idle instanceof HTMLElement && idle.getAttribute("aria-disabled") !== "true";
    })()`,
  );
}

// A person enters this field by clicking it or by tabbing to it, and only those real inputs mount
// the live editor reliably: a synthetic focus call on the idle layer does not. Every step that
// needs the live editor therefore enters it with a real pointer press.
export async function enterCallableField(client, callableLabel) {
  await waitForIdleCallableField(client, callableLabel);
  await clickElementCenter(
    client,
    idleCallableSelector(callableLabel),
    "The idle callable field",
  );
  await waitFor(
    client,
    "the clicked callable field mounting and focusing its live editor",
    `(() => {
      const live = document.querySelector(${JSON.stringify(liveCallableSelector(callableLabel))});
      return live instanceof HTMLElement && document.activeElement === live;
    })()`,
  );
}

// The field's own box and the text layer inside it, read through the package's documented
// section-field hook and this control's accessible name. Nothing here selects a package class.
export function callableFieldStateScript(textSelector) {
  return `(() => {
    const field = document.querySelector(${JSON.stringify(sectionFieldSelector)});
    const text = document.querySelector(${JSON.stringify(textSelector)});
    if (!(field instanceof HTMLElement) || !(text instanceof HTMLElement)) {
      return null;
    }
    const rect = field.getBoundingClientRect();
    const fieldStyle = window.getComputedStyle(field);
    const textStyle = window.getComputedStyle(text);
    return {
      box: { height: rect.height, width: rect.width, x: rect.x, y: rect.y },
      surface: {
        backgroundColor: fieldStyle.backgroundColor,
        borderRadius: fieldStyle.borderTopLeftRadius,
        borderWidth: fieldStyle.borderTopWidth,
        marginInline: fieldStyle.marginLeft + " " + fieldStyle.marginRight,
        padding: fieldStyle.paddingTop + " " + fieldStyle.paddingRight + " " +
          fieldStyle.paddingBottom + " " + fieldStyle.paddingLeft,
      },
      borderColor: fieldStyle.borderTopColor,
      isActiveElement: document.activeElement === text,
      contentEditable: text.getAttribute("contenteditable"),
      value: text.textContent,
      type: {
        color: textStyle.color,
        fontFamily: textStyle.fontFamily,
        fontSize: textStyle.fontSize,
        fontWeight: textStyle.fontWeight,
        lineHeight: textStyle.lineHeight,
      },
    };
  })()`;
}

// The generated surface, the block painted on the lines its region covers, its badge, the reader's
// own content box, and the text layer inside it, read through the package's documented
// section-editor and generated-line hooks plus the reader's ARIA role. Nothing here selects a
// package class or requires the editor's internal per-line structure to exist: the block is
// enumerated through its public marks, and the authored text outside it is the distance between
// the block's two ends and the reader's content box.
export const generatedDocumentStateScript = `(() => {
  const surface = document.querySelector(${JSON.stringify(generatedDocumentSelector)});
  const text = surface?.querySelector('[role="textbox"]');
  const blockLines = [...(surface?.querySelectorAll(${JSON.stringify(generatedBlockLineSelector)}) ?? [])];
  const blockStart = surface?.querySelector(${JSON.stringify(generatedBlockStartSelector)});
  const blockEnd = [...(surface?.querySelectorAll(${JSON.stringify(generatedBlockEndSelector)}) ?? [])].pop();
  if (
    !(surface instanceof HTMLElement) ||
    !(text instanceof HTMLElement) ||
    !(blockStart instanceof HTMLElement) ||
    !(blockEnd instanceof HTMLElement)
  ) {
    return null;
  }
  const rect = surface.getBoundingClientRect();
  const contentRect = text.getBoundingClientRect();
  const startRect = blockStart.getBoundingClientRect();
  const endRect = blockEnd.getBoundingClientRect();
  const surfaceStyle = window.getComputedStyle(surface);
  const regionStyle = window.getComputedStyle(blockStart, "::before");
  const badgeStyle = window.getComputedStyle(blockStart, "::after");
  const textStyle = window.getComputedStyle(text);
  return {
    box: { height: rect.height, width: rect.width, x: rect.x, y: rect.y },
    // The generated block itself: it starts on the first line its region covers and ends on the
    // last, which for this document are the two blank separators around the generated body. Its
    // own text is what the region claims, so the authored statements must not appear in it.
    block: {
      bottom: endRect.bottom,
      lineBoxCssPx: startRect.height,
      lineCount: blockLines.length,
      marks: blockLines.map((line) => line.getAttribute("data-workspace-generated-line")),
      text: blockLines.map((line) => line.textContent).join("\\n"),
      top: startRect.top,
      width: startRect.width,
    },
    // The reader's whole content box. The prefix and suffix the Go response owns are the text
    // between it and the block's two ends, so the region visibly begins below the reader's first
    // line and ends above its last.
    content: { bottom: contentRect.bottom, top: contentRect.top },
    // The editor wrapper the rejected candidate painted instead of the lines.
    wrapper: { backgroundImage: surfaceStyle.backgroundImage },
    region: {
      backgroundImage: regionStyle.backgroundImage,
      borderRadius: regionStyle.borderTopLeftRadius,
    },
    // Where the region and the badge sit on the line they decorate.
    placement: {
      badgeInlineStart: badgeStyle.left,
      badgeInsetBlockStart: badgeStyle.top,
      badgeTransform: badgeStyle.transform,
      regionInlineEnd: regionStyle.right,
      regionInlineStart: regionStyle.left,
      regionInsetBlockStart: regionStyle.top,
    },
    badge: {
      backgroundColor: badgeStyle.backgroundColor,
      content: badgeStyle.content,
      textTransform: badgeStyle.textTransform,
    },
    text: {
      contentEditable: text.getAttribute("contenteditable"),
      isActiveElement: document.activeElement === text,
      outlineStyle: textStyle.outlineStyle,
      outlineWidth: textStyle.outlineWidth,
      readOnly: text.getAttribute("aria-readonly"),
      source: text.textContent,
    },
    // Where the caret is, in the only vocabulary this package publishes for the block: the line
    // it sits on either carries the generated mark or it does not. Nothing typed can land inside
    // the block, so no caret may rest there.
    caretInsideBlock: (() => {
      const node = window.getSelection()?.anchorNode ?? null;
      const element = node instanceof Element ? node : (node?.parentElement ?? null);
      return element instanceof Element && text.contains(element)
        ? element.closest(${JSON.stringify(generatedBlockLineSelector)}) !== null
        : false;
    })(),
  };
})()`;

// The settled card at whatever zoom the scene is displayed at: its own box, the canvas box it has
// to stay inside, and the compositing the package leaves on it. The card is the accessible group
// this app already reads and the canvas is its own accessible region, so nothing here depends on a
// package-private hook.
const settledSectionStateScript = `(() => {
  const section = document.querySelector(${JSON.stringify(callableSectionSelector)});
  const canvas = document.querySelector(${JSON.stringify(workspaceCanvasSelector)});
  if (!(section instanceof HTMLElement) || !(canvas instanceof HTMLElement)) {
    return null;
  }
  const rect = section.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();
  const style = window.getComputedStyle(section);
  return {
    box: { height: rect.height, width: rect.width, x: rect.x, y: rect.y },
    canvas: {
      bottom: canvasRect.bottom,
      left: canvasRect.left,
      right: canvasRect.right,
      top: canvasRect.top,
    },
    compositing: {
      backfaceVisibility: style.backfaceVisibility,
      isolation: style.isolation,
      transform: style.transform,
      willChange: style.willChange,
    },
    zoom: (() => {
      const scale = new DOMMatrixReadOnly(
        window.getComputedStyle(document.querySelector(".react-flow__viewport") ?? section).transform,
      );
      return scale.a;
    })(),
  };
})()`;

// The open completion popup, the field it belongs to, and the section that used to crop it. The
// popup is found by its own accessible role, and the page's own hit testing says what a person can
// actually see of it: a popup clipped back inside the pill has nothing under these two points.
const callableCompletionPopupScript = `(() => {
  const section = document.querySelector(${JSON.stringify(callableSectionSelector)});
  const field = document.querySelector(${JSON.stringify(sectionFieldSelector)});
  const popup = document.querySelector(${JSON.stringify(callableCompletionPopupSelector)});
  if (
    !(section instanceof HTMLElement) ||
    !(field instanceof HTMLElement) ||
    !(popup instanceof HTMLElement)
  ) {
    return null;
  }
  const fieldRect = field.getBoundingClientRect();
  const popupRect = popup.getBoundingClientRect();
  const hits = (x, y) => {
    const target = document.elementFromPoint(x, y);
    return target instanceof Node && popup.contains(target);
  };
  const centreX = popupRect.left + popupRect.width / 2;
  return {
    field: { bottom: fieldRect.bottom, height: fieldRect.height, top: fieldRect.top },
    popup: {
      bottom: popupRect.bottom,
      height: popupRect.height,
      top: popupRect.top,
      width: popupRect.width,
    },
    // The clipping boxes the rejected placement rendered inside.
    fieldContainsPopup: field.contains(popup),
    sectionContainsPopup: section.contains(popup),
    // Two points below the field's own bottom edge: the popup's middle and its last visible row.
    isVisibleAtMiddle: hits(centreX, (Math.max(popupRect.top, fieldRect.bottom) + popupRect.bottom) / 2),
    isVisibleAtBottom: hits(centreX, popupRect.bottom - 2),
    optionCount: popup.querySelectorAll('[role="option"]').length,
  };
})()`;

// CodeMirror mounts a completion tooltip parked far above the document and gives it its real
// position on the next measure pass, so the popup's options exist before its box means anything.
// The offered completion is therefore not enough to read placement by; this waits for the popup to
// leave the park. A popup a section crops is placed and then clipped, so it never parks here and
// this wait cannot hide the defect the assertion is about.
export async function readPlacedCallableCompletionPopup(client, stage) {
  return waitFor(
    client,
    `${stage} completion popup taking its place beside the callable field`,
    `(() => {
      const state = ${callableCompletionPopupScript};
      return state === null || state.popup.bottom <= 0 ? null : state;
    })()`,
  );
}

// The complete Square Root card: the developer rejected a candidate whose field crops looked
// right while the card around them did not, so the composition is measured as one stack — the
// section's own box, its header, the field, the Args toolbar, and the first parameter row.
export const callableSectionStateScript = `(() => {
  const section = document.querySelector(${JSON.stringify(callableSectionSelector)});
  const header = document.querySelector(${JSON.stringify(sectionHeaderSelector)});
  const field = document.querySelector(${JSON.stringify(sectionFieldSelector)});
  const toolbar = document.querySelector(${JSON.stringify(itemToolbarSelector)});
  const firstParameter = document.querySelector(${JSON.stringify(firstParameterSelector)});
  if (
    !(section instanceof HTMLElement) ||
    !(header instanceof HTMLElement) ||
    !(field instanceof HTMLElement) ||
    !(toolbar instanceof HTMLElement) ||
    !(firstParameter instanceof HTMLElement)
  ) {
    return null;
  }
  const readBox = (element) => {
    const rect = element.getBoundingClientRect();
    return {
      bottom: rect.bottom,
      height: rect.height,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      width: rect.width,
    };
  };
  return {
    field: readBox(field),
    firstParameter: readBox(firstParameter),
    header: readBox(header),
    section: readBox(section),
    toolbar: readBox(toolbar),
    // The app-owned content root around the package's item list. Its padding is what pushed the
    // whole stack away from the card.
    contentPadding: (() => {
      const content = document.querySelector(".python-canvas-callable-section");
      if (!(content instanceof HTMLElement)) {
        return null;
      }
      const style = window.getComputedStyle(content);
      const parentStyle = window.getComputedStyle(content.parentElement ?? content);
      return {
        content: style.padding,
        slot: parentStyle.padding,
      };
    })(),
  };
})()`;

// Main's accepted card is continuous: the field sits at the header's boundary with its own narrow
// inline inset, and the Args surface starts at the field's. Every step below belongs to the
// package; an app padding or gap shows up as one of them growing.
export function assertDonorSectionComposition(state, appearance) {
  const measured = {
    fieldToToolbarCssPx: state.toolbar.top - state.field.bottom,
    headerToFieldCssPx: state.field.top - state.header.bottom,
    sectionToFieldInlineCssPx: state.field.left - state.section.left,
    toolbarToFirstParameterCssPx:
      state.firstParameter.top - state.toolbar.bottom,
  };
  for (const [step, expected] of Object.entries(donorSectionComposition)) {
    const drift = Math.abs(measured[step] - expected);
    if (!Number.isFinite(drift) || drift > compositionToleranceCssPx) {
      throw new Error(
        `The ${appearance} Square Root card measured ${step} at ${String(Math.round(measured[step]))} CSS px instead of the donor's ${String(expected)}.`,
      );
    }
  }
  // The field's two inline edges are symmetric, so a one-sided app inset cannot hide behind the
  // leading measurement above.
  const trailingInset = state.section.right - state.field.right;
  if (
    Math.abs(
      trailingInset - donorSectionComposition.sectionToFieldInlineCssPx,
    ) > compositionToleranceCssPx
  ) {
    throw new Error(
      `The ${appearance} Square Root card inset its callable field ${String(Math.round(trailingInset))} CSS px from its trailing edge.`,
    );
  }
  if (
    state.contentPadding === null ||
    state.contentPadding.content !== "0px" ||
    state.contentPadding.slot !== "0px"
  ) {
    throw new Error(
      `The ${appearance} Square Root card pads its package-owned content with ${JSON.stringify(state.contentPadding)}.`,
    );
  }
}

// Enlarge the scene with the canvas's own pinch zoom, leave the pointer on the card the way a
// person's hand does, and wait for the gesture to settle. The card's measured growth is what
// proves the gesture arrived; nothing here asks the browser whether an input was delivered.
//
// The gesture is anchored on the callable field. The scene zoom keeps the point under the cursor
// fixed, so the anchor decides where the enlarged card lands: anchoring on the card's own centre
// pushed its header up out of the canvas and under the application's status strip, while the
// field is the card's primary control and sits near its top, so the whole header-to-parameter
// composition stays inside the canvas. Nothing about how the product itself zooms changes.
export async function zoomCanvasOnCallableCard(client) {
  const before = await readSettledSectionState(client, "The unzoomed");
  const point = await elementCenter(
    client,
    sectionFieldSelector,
    "The callable field",
  );
  await movePointerTo(client, point);
  await pinchZoomCanvas(client, point, zoomWheelDelta);
  await waitFor(
    client,
    "the pinch-zoomed canvas settling on an enlarged Square Root card",
    `(() => {
      const section = document.querySelector(${JSON.stringify(callableSectionSelector)});
      return section instanceof HTMLElement &&
        section.getBoundingClientRect().width >=
          ${String(before.box.width)} * ${String(minimumZoomedCardGrowth)};
    })()`,
  );
  await delay(zoomSettleMs);
  // The card grew under the cursor, so the pointer is put back on its middle: the hovered idle
  // canvas is the state whose compositing this correction is about.
  const settledPoint = await elementCenter(
    client,
    callableSectionSelector,
    "The zoomed Square Root card",
  );
  await movePointerTo(client, settledPoint);
  const settled = await readSettledSectionState(client, "The zoomed");
  const growth = settled.box.width / before.box.width;
  if (!(growth >= minimumZoomedCardGrowth)) {
    throw new Error(
      `The canvas pinch zoom left the Square Root card at ${growth.toFixed(2)}x its unzoomed width instead of at least ${String(minimumZoomedCardGrowth)}x.`,
    );
  }
  return settled;
}

export async function readSettledSectionState(client, stage) {
  const state = await evaluate(client, settledSectionStateScript);
  if (state === null) {
    throw new Error(`${stage} Square Root card did not render.`);
  }
  return state;
}

// The complete card stays inside the canvas at whatever zoom it is displayed at. An enlarged card
// that leaves it is not a state anything can photograph: the missing area sits under the
// application's status strip, and a crop of what remains is a plausible-looking partial card.
export function assertSettledCardIsInsideCanvas(stage, state) {
  const clipped = Object.entries({
    bottom: state.box.y + state.box.height - state.canvas.bottom,
    left: state.canvas.left - state.box.x,
    right: state.box.x + state.box.width - state.canvas.right,
    top: state.canvas.top - state.box.y,
  }).filter(([, overflow]) => overflow > cardInsideCanvasToleranceCssPx);
  if (clipped.length > 0) {
    const edges = clipped
      .map(
        ([edge, overflow]) =>
          `${String(Math.round(overflow))} CSS px at its ${edge}`,
      )
      .join(", ");
    throw new Error(
      `${stage} Square Root card reaches outside the workspace canvas by ${edges}, so the complete card is not on screen to capture.`,
    );
  }
}

// A settled section carries no compositor layer of its own, hovered or not, so its text, icons,
// and borders are rasterized at the zoom they are shown at.
export function assertSettledSectionIsNotPromoted(stage, state) {
  for (const [property, expected] of Object.entries(
    settledSectionCompositing,
  )) {
    if (state.compositing[property] !== expected) {
      throw new Error(
        `${stage} settled Square Root card kept ${property} ${JSON.stringify(state.compositing[property])} instead of ${JSON.stringify(expected)}, so its content is scaled from a stale layer.`,
      );
    }
  }
}

// The reference parents its completion popup beside the canvas scene. The rejected placement left
// it inside the section, which cropped it down to the horizontal line the developer saw across
// the focused pill.
export function assertCompletionPopupEscapesTheSection(stage, state) {
  if (state.optionCount < 1) {
    throw new Error(`${stage} completion popup offered nothing to place.`);
  }
  if (state.sectionContainsPopup || state.fieldContainsPopup) {
    throw new Error(
      `${stage} completion popup is still inside the ${state.fieldContainsPopup ? "callable field" : "Square Root section"}, which clips it.`,
    );
  }
  const below = state.popup.bottom - state.field.bottom;
  if (!Number.isFinite(below) || below < popupBelowFieldCssPx) {
    throw new Error(
      `${stage} completion popup reached ${String(Math.round(below))} CSS px past the field's own bottom edge, so it is the sliver a clipped popup leaves inside the pill.`,
    );
  }
  if (!state.isVisibleAtMiddle || !state.isVisibleAtBottom) {
    throw new Error(
      `${stage} completion popup is not what the page hit-tests below the callable field, so its box is painted somewhere the field or its section crops.`,
    );
  }
}

export function assertDonorCallableFieldSurface(state, appearance) {
  const donor = donorAppearance(donorCallableField, appearance);
  for (const [property, expected] of Object.entries(donor.surface)) {
    if (state.surface[property] !== expected) {
      throw new Error(
        `The idle ${appearance} callable field rendered ${property} ${JSON.stringify(state.surface[property])} instead of the donor's ${JSON.stringify(expected)}.`,
      );
    }
  }
  if (state.borderColor !== donor.borderColor) {
    throw new Error(
      `The idle ${appearance} callable field rendered the border colour ${JSON.stringify(state.borderColor)} instead of the donor's ${JSON.stringify(donor.borderColor)}.`,
    );
  }
}

export function assertCallableFieldParity(
  idle,
  live,
  typeProperties,
  appearance,
) {
  const donor = donorAppearance(donorCallableField, appearance);
  for (const [property, idleValue] of Object.entries(idle.box)) {
    const drift = Math.abs(idleValue - live.box[property]);
    if (drift > fieldGeometryToleranceCssPx) {
      throw new Error(
        `Activating the ${appearance} callable field moved its ${property} by ${String(drift)} CSS px.`,
      );
    }
  }
  for (const property of typeProperties) {
    if (live.type[property] !== idle.type[property]) {
      throw new Error(
        `Activating the ${appearance} callable field changed ${property} from ${JSON.stringify(idle.type[property])} to ${JSON.stringify(live.type[property])}.`,
      );
    }
  }
  for (const [property, idleValue] of Object.entries(idle.surface)) {
    if (live.surface[property] !== idleValue) {
      throw new Error(
        `Activating the ${appearance} callable field changed ${property} from ${JSON.stringify(idleValue)} to ${JSON.stringify(live.surface[property])}.`,
      );
    }
  }
  if (live.borderColor !== donor.focusBorderColor) {
    throw new Error(
      `The focused ${appearance} callable field rendered the border colour ${JSON.stringify(live.borderColor)} instead of the donor's ${JSON.stringify(donor.focusBorderColor)}.`,
    );
  }
  if (idle.borderColor === live.borderColor) {
    throw new Error(
      `The ${appearance} callable field's border colour did not change when it took focus.`,
    );
  }
}

export function assertDonorGeneratedRegion(state, appearance) {
  const donor = donorAppearance(donorGeneratedDocument, appearance);
  for (const [property, expected] of Object.entries(donor.region)) {
    if (state.region[property] !== expected) {
      throw new Error(
        `Generated Python rendered ${appearance} ${property} ${JSON.stringify(state.region[property])} instead of the donor's ${JSON.stringify(expected)}.`,
      );
    }
  }
  for (const [property, expected] of Object.entries(donor.badge)) {
    if (state.badge[property] !== expected) {
      throw new Error(
        `The ${appearance} generated Python badge rendered ${property} ${JSON.stringify(state.badge[property])} instead of the donor's ${JSON.stringify(expected)}.`,
      );
    }
  }
  assertDonorBadgePlacement(state, appearance);
}

function assertDonorBadgePlacement(state, appearance) {
  const { placement } = state;
  // The badge's own origin is the block's upper boundary, and the two-dimensional negative
  // translation centres it there instead of hanging it below the edge.
  if (placement.badgeInsetBlockStart !== placement.regionInsetBlockStart) {
    throw new Error(
      `The ${appearance} generated Python badge starts at ${JSON.stringify(placement.badgeInsetBlockStart)} while its block's top edge is at ${JSON.stringify(placement.regionInsetBlockStart)}.`,
    );
  }
  const translation = /^matrix\(1, 0, 0, 1, (-?[\d.]+), (-?[\d.]+)\)$/u.exec(
    placement.badgeTransform,
  );
  if (translation === null) {
    throw new Error(
      `The ${appearance} generated Python badge carried the transform ${JSON.stringify(placement.badgeTransform)} instead of centring itself on the block's boundary.`,
    );
  }
  if (Number(translation[1]) >= 0 || Number(translation[2]) >= 0) {
    throw new Error(
      `The ${appearance} generated Python badge translated by ${translation[1]}, ${translation[2]}, so it hangs off its origin instead of centring on it.`,
    );
  }
  const blockCentre =
    (Number.parseFloat(placement.regionInlineStart) +
      state.block.width -
      Number.parseFloat(placement.regionInlineEnd)) /
    2;
  const drift = Math.abs(
    Number.parseFloat(placement.badgeInlineStart) - blockCentre,
  );
  if (!Number.isFinite(drift) || drift > badgeCentreToleranceCssPx) {
    throw new Error(
      `The ${appearance} generated Python badge sits ${String(Math.round(drift))} CSS px from the centre of its block.`,
    );
  }
}

// The supervisor rejected a generated region that filled the section's unused height and put its
// badge in the corner of the empty panel below the code. The region is painted on the rendered
// lines, so the block ends with the document and the rest of the section keeps the ordinary
// Code-section surface.
export function assertGeneratedBlockHugsCode(stage, state) {
  if (state.wrapper.backgroundImage !== "none") {
    throw new Error(
      `${stage} generated Python painted its editor wrapper ${JSON.stringify(state.wrapper.backgroundImage)} instead of its document lines.`,
    );
  }
  const unpainted = state.box.y + state.box.height - state.block.bottom;
  if (unpainted < unpaintedSectionHeightCssPx) {
    throw new Error(
      `${stage} generated block ended ${String(Math.round(unpainted))} CSS px above the section's own bottom, so it is filling height its document does not occupy.`,
    );
  }
}

// The developer rejected a candidate that painted `import math` and `state = SettaState()` as
// generated output. Only the body between the target's prefix and suffix is generated, so the
// block runs from the blank separator above it to the blank separator below it and the two
// authored lines keep the ordinary Code-section surface. Three public reads prove that: the
// block's own marks form one well-formed run, its two ends leave a whole line box of the reader
// outside them, and the authored statements the reader shows are absent from the block's text.
export function assertGeneratedRegionBoundsItsBody(stage, state) {
  assertWellFormedGeneratedBlock(stage, state.block.marks);
  assertReaderTextOutsideBlock(stage, state);
  assertAuthoredStatementsUnclaimed(stage, state);
}

// The two blank separators bound at least one generated line, so the block's own marks are one
// start, at least one middle, and one end. A shorter run means the region no longer spans the
// body it is declared around.
function assertWellFormedGeneratedBlock(stage, marks) {
  const wellFormed =
    marks.length >= 3 &&
    marks[0] === "start" &&
    marks[marks.length - 1] === "end" &&
    marks.slice(1, -1).every((mark) => mark === "middle");
  if (!wellFormed) {
    throw new Error(
      `${stage} generated Python marked its block ${JSON.stringify(marks)} instead of one start, at least one middle, and one end.`,
    );
  }
}

// A whole line box of the reader stays outside each of the block's two ends, which is where the
// target's authored prefix and suffix are. The rejected candidate left neither.
function assertReaderTextOutsideBlock(stage, state) {
  for (const [edge, part, gap] of [
    ["above", "prefix", state.block.top - state.content.top],
    ["below", "suffix", state.content.bottom - state.block.bottom],
  ]) {
    if (!Number.isFinite(gap) || gap < state.block.lineBoxCssPx) {
      throw new Error(
        `${stage} generated block left ${String(Math.round(gap))} CSS px of the reader ${edge} it, less than the ${String(Math.round(state.block.lineBoxCssPx))} CSS px line box the target's authored ${part} occupies.`,
      );
    }
  }
}

// The same boundary stated over the text rather than the geometry: the reader shows both authored
// statements and the block's own text claims neither, which also proves this is still the
// canonical document the region was declared for.
function assertAuthoredStatementsUnclaimed(stage, state) {
  for (const authored of authoredGeneratedLines) {
    if (state.block.text.includes(authored)) {
      throw new Error(
        `${stage} generated Python claimed the authored line ${JSON.stringify(authored)} as generated output.`,
      );
    }
    if (state.text.source?.includes(authored) !== true) {
      throw new Error(
        `${stage} generated Python is not the canonical document: its reader never shows ${JSON.stringify(authored)}.`,
      );
    }
  }
}

// The reference authors the Python around its generated body, so this surface is an editor: what
// it refuses is the declared range. The developer rejected a candidate that drew a black caret
// line inside output nobody could author, so the caret has to stay outside the block and no inner
// outline may appear either side of a real pointer press.
export function assertAuthorableGeneratedDocument(stage, state) {
  if (state.text.contentEditable !== "true") {
    throw new Error(
      `${stage} generated Python is not an editing surface, so its authored prefix and suffix cannot be written.`,
    );
  }
  if (state.text.readOnly === "true") {
    throw new Error(
      `${stage} generated Python names its whole document read-only.`,
    );
  }
  if (state.caretInsideBlock) {
    throw new Error(
      `${stage} generated Python placed the caret inside the block, where nothing typed can land.`,
    );
  }
  if (state.text.outlineStyle !== "none" && state.text.outlineWidth !== "0px") {
    throw new Error(
      `${stage} generated Python text drew the inner outline ${JSON.stringify(state.text.outlineStyle)}.`,
    );
  }
}

// The field opens on its canonical committed value, so a draft is replaced rather than typed into.
// Every key that acts on that draft stays with the caller, because what the canonical project does
// between those keys is exactly what the walkthrough is judging.
export async function replaceCallableDraft(client, callableLabel, draft) {
  await enterCallableField(client, callableLabel);
  await selectAll(client);
  await insertText(client, draft);
  await waitForCallableDraft(client, callableLabel, draft);
}

export async function waitForCallableDraft(client, callableLabel, draft) {
  await waitFor(
    client,
    `the callable draft holding ${JSON.stringify(draft)}`,
    `document.querySelector(${JSON.stringify(textBoxSelector(callableLabel))})?.textContent === ${JSON.stringify(draft)}`,
  );
}

export async function waitForCallableCompletion(client, label) {
  await waitFor(
    client,
    `the accessible ${label} completion`,
    `Array.from(document.querySelectorAll('[role="option"]')).some((option) => option.textContent?.trim() === ${JSON.stringify(label)})`,
  );
}

export async function waitForClosedCallableCompletion(client) {
  await waitFor(
    client,
    "the completion popup closing",
    `document.querySelector('[role="option"]') === null`,
  );
}

// Escape hands the field back to its section, so the value a reverted draft leaves behind is the
// one the idle layer paints once the live editor is gone.
export async function waitForIdleCallableValue(client, callableLabel, value) {
  await waitFor(
    client,
    `the idle callable field showing ${JSON.stringify(value)}`,
    `(() => {
      const live = document.querySelector(${JSON.stringify(liveCallableSelector(callableLabel))});
      const idle = document.querySelector(${JSON.stringify(idleCallableSelector(callableLabel))});
      return live === null && idle?.textContent === ${JSON.stringify(value)};
    })()`,
  );
}

function donorAppearance(donor, appearance) {
  const values = donor[appearance];
  if (values === undefined) {
    throw new Error(`Unknown workspace appearance: ${String(appearance)}.`);
  }
  return values;
}
