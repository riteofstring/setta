import {
  clickElementCenter,
  insertText,
  pressEnter,
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
// The card's own header landmark, and the app's own first parameter label below the toolbar.
const sectionHeaderSelector = `${callableSectionSelector} header`;
const firstParameterSelector = ".python-canvas-parameter-label";
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

// An empty field shows its own muted placeholder layer against CodeMirror's placeholder, so text
// colour is compared only where both layers render the same committed value.
export const fieldTypeProperties = [
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
];
export const fieldValueTypeProperties = [...fieldTypeProperties, "color"];

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

export function idleCallableSelector(callableLabel) {
  return `${textBoxSelector(callableLabel)}:not([contenteditable="true"])`;
}

export function liveCallableSelector(callableLabel) {
  return `${textBoxSelector(callableLabel)}[contenteditable="true"]`;
}

export async function waitForEnabledCallableField(client, callableLabel) {
  await waitFor(
    client,
    "enabled callable editor after initial provider work",
    `(() => {
      const control = document.querySelector(${JSON.stringify(textBoxSelector(callableLabel))});
      return control instanceof HTMLElement && control.getAttribute("aria-disabled") !== "true";
    })()`,
  );
}

// A person enters this field by clicking it or by tabbing to it, and only those real inputs mount
// the live editor reliably: a synthetic focus call on the idle layer does not. Every step that
// needs the live editor therefore enters it with a real pointer press.
export async function enterCallableField(client, callableLabel) {
  await waitForEnabledCallableField(client, callableLabel);
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
    // CodeMirror's own caret and active-line layers. A non-editing surface must mount neither,
    // and their absence is the only DOM evidence that no caret is drawn.
    hasCaretLayer: surface.querySelector(".cm-cursor") !== null,
    hasActiveLine: surface.querySelector(".cm-activeLine") !== null,
  };
})()`;

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

export function assertNonEditingGeneratedText(stage, state) {
  if (state.text.contentEditable !== "false") {
    throw new Error(
      `${stage} generated Python text is still an editing surface.`,
    );
  }
  if (state.text.readOnly !== "true") {
    throw new Error(`${stage} generated Python text is not named read-only.`);
  }
  if (state.text.isActiveElement) {
    throw new Error(`${stage} generated Python text took the keyboard focus.`);
  }
  if (state.hasCaretLayer || state.hasActiveLine) {
    throw new Error(
      `${stage} generated Python painted a caret or an active line.`,
    );
  }
  if (state.text.outlineStyle !== "none" && state.text.outlineWidth !== "0px") {
    throw new Error(
      `${stage} generated Python text drew the inner outline ${JSON.stringify(state.text.outlineStyle)}.`,
    );
  }
}

// The product walkthrough's first Enter: it selects the accessible `sqrt` completion and changes
// only the local draft. The second Enter, which commits, stays with the caller so the walkthrough
// can prove the canonical project between them.
export async function selectSqrtCompletion(client, callableLabel) {
  await enterCallableField(client, callableLabel);
  await insertText(client, "math.sq");
  await waitFor(
    client,
    "accessible sqrt completion",
    `Array.from(document.querySelectorAll('[role="option"]')).some((option) => option.textContent?.trim() === "sqrt")`,
  );
  await pressEnter(client);
  await waitFor(
    client,
    "first completion Enter changing the callable draft",
    `document.querySelector(${JSON.stringify(textBoxSelector(callableLabel))})?.textContent === "math.sqrt"`,
  );
}

function donorAppearance(donor, appearance) {
  const values = donor[appearance];
  if (values === undefined) {
    throw new Error(`Unknown workspace appearance: ${String(appearance)}.`);
  }
  return values;
}
