import {
  clickElementCenter,
  insertText,
  pressEnter,
  textBoxSelector,
  waitFor,
} from "./browser-page.mjs";

// The two package-owned surfaces this presentation correction is about: the section-field callable
// editor and the generated-output Code section. This module owns the donor values each one must
// paint in each appearance, the page-side reads that observe them, and the callable commit that
// puts the section into its ordinary committed state. The production walkthrough proves them in the
// appearance it runs in and the capture harness records both, so a donor value has one owner.
//
// Every selector here is an accessible name or a documented package hook.

export const sectionFieldSelector = "[data-workspace-section-field]";
export const generatedOutputSelector =
  '[data-workspace-section-editor="generated-output"]';

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
// rail, six-pixel rounded ends, and the compact uppercase badge. Chromium expands the rail's
// double-position stop into its two computed stops.
export const donorGeneratedOutput = {
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

// The generated surface, its badge, and the text layer inside it, read through the package's
// documented section-editor hook. Nothing here selects a package class.
export const generatedOutputStateScript = `(() => {
  const surface = document.querySelector(${JSON.stringify(generatedOutputSelector)});
  const text = surface?.querySelector('[role="textbox"]');
  if (!(surface instanceof HTMLElement) || !(text instanceof HTMLElement)) {
    return null;
  }
  const rect = surface.getBoundingClientRect();
  const surfaceStyle = window.getComputedStyle(surface);
  const badgeStyle = window.getComputedStyle(surface, "::after");
  const textStyle = window.getComputedStyle(text);
  return {
    box: { height: rect.height, width: rect.width, x: rect.x, y: rect.y },
    region: {
      backgroundImage: surfaceStyle.backgroundImage,
      borderRadius: surfaceStyle.borderTopLeftRadius,
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
  const donor = donorAppearance(donorGeneratedOutput, appearance);
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
