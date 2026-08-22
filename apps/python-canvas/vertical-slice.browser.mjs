import {
  assertAuthoredPythonAroundTheGeneratedBody,
  assertTargetlessDocumentDiagnostic,
} from "./browser-generated-python.mjs";
import { assertCallableDiagnosticPresentation } from "./browser-diagnostics.mjs";
import {
  assertAuthoredParameterAuthoring,
  assertStructuralParameterControls,
  firstStructuralControlName,
} from "./browser-parameters.mjs";
import {
  fetchCanonicalSnapshot,
  runAgainstProductionApp,
} from "./browser-processes.mjs";
import {
  activateTextBox,
  clickElementCenter,
  dragSelectElement,
  evaluate,
  insertText,
  labeledSelector,
  navigate,
  pressEnter,
  pressEscape,
  pressModifierK,
  pressTab,
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
  assertAuthorableGeneratedDocument,
  assertGeneratedBlockHugsCode,
  assertGeneratedRegionBoundsItsBody,
  assertSettledCardIsInsideCanvas,
  assertSettledSectionIsNotPromoted,
  callableFieldStateScript,
  callableSectionSelector,
  callableSectionStateScript,
  enterCallableField,
  fieldTypeProperties,
  firstParameterSelector,
  generatedDocumentSelector,
  generatedDocumentStateScript,
  idleCallableSelector,
  itemToolbarSelector,
  liveCallableSelector,
  readPlacedCallableCompletionPopup,
  readSettledSectionState,
  replaceCallableDraft,
  waitForCallableCompletion,
  waitForCallableDraft,
  waitForClosedCallableCompletion,
  waitForIdleCallableField,
  waitForIdleCallableValue,
  zoomCanvasOnCallableCard,
} from "./callable-presentation.mjs";

// The Callable section is observed through public surfaces only: its accessible section group,
// the package's one documented toolbar hook, and this app's own content root.
const callableContentSelector = ".python-canvas-callable-section";
// The application follows the reader's system appearance, so this walkthrough pins the one it
// asserts donor values for. The capture harness records both.
const walkthroughAppearance = "light";

// The Args filter's own controls, resolved from its accessible name and required to belong to
// the rendered toolbar. Nothing here reads package-private toolbar structure.
const filterControlsScript = `(() => {
  const toolbar = document.querySelector(${JSON.stringify(itemToolbarSelector)});
  const label = Array.from(document.querySelectorAll("label")).find(
    (candidate) => candidate.textContent?.trim() === "Filter parameters",
  );
  const input = label instanceof HTMLLabelElement ? label.control : null;
  if (
    !(toolbar instanceof HTMLElement) ||
    !(input instanceof HTMLInputElement) ||
    !toolbar.contains(input)
  ) {
    return null;
  }
  return {
    input,
    status: document.getElementById(input.getAttribute("aria-describedby") ?? ""),
    toolbar,
  };
})()`;

function withFilterControls(body) {
  return `(() => {
    const controls = ${filterControlsScript};
    if (controls === null) {
      return null;
    }
    ${body}
  })()`;
}

// The analyzer vocabulary main's ordinary parameter row never shows. The rejected candidate printed
// the passing style and Basedpyright's own type spelling under the parameter name.
const analyzerRowSpellings = ["positional", "keyword only", "_SupportsFloat"];

// The chord this platform's reader sees for the built-in item-filter binding, and the keys that
// produce it. The package resolves the label from its own binding registry; this walkthrough runs
// on Linux and macOS CI alike, so it asks the platform the same question the package does.
const filterChord = process.platform === "darwin" ? "⌘ + K" : "Ctrl + K";

// What the Go service has already committed by the time it answers its first request: the shipped
// callable, its one provider-derived parameter, and the call they generate.
const shippedExample = {
  callable: "math.sqrt",
  generatesItsCall: true,
  parameterNames: ["x"],
};
// The accessible completion the shipped expression's own text still offers, which is what makes an
// open popup available to the commit Enter that has to win over it.
const shippedCompletionLabel = "sqrt";

// A second real callable the demo does not boot with. Committing it is what makes the canonical
// project actually move, so the keys before the commit can be proved not to move it.
const otherCallable = {
  callable: "math.floor",
  completion: "floor",
  draft: "math.fl",
};

// What the raw first render shows, read through accessible names and this app's own label class.
// A value editor's idle layer renders its placeholder inside the same accessible text box, so the
// text these reads return is exactly what a person sees — whether it came from the project or from
// invented sample copy.
function renderedSectionValuesScript(callableLabel, parameterLabel) {
  return `(() => {
    const section = document.querySelector(${JSON.stringify(callableSectionSelector)});
    const callable = document.querySelector(${JSON.stringify(textBoxSelector(callableLabel))});
    const parameter = document.querySelector(${JSON.stringify(textBoxSelector(parameterLabel))});
    const label = document.querySelector(${JSON.stringify(firstParameterSelector)});
    const generated = document
      .querySelector(${JSON.stringify(generatedDocumentSelector)})
      ?.querySelector('[role="textbox"]');
    if (
      !(section instanceof HTMLElement) ||
      !(callable instanceof HTMLElement) ||
      !(parameter instanceof HTMLElement) ||
      !(label instanceof HTMLElement) ||
      !(generated instanceof HTMLElement)
    ) {
      return null;
    }
    // The initial missing-required-argument diagnostic is correct visible feedback, and
    // Basedpyright is free to use analyzer vocabulary such as "positional" in its complete
    // message. Keep that accessible announcement out of the independent check for metadata that
    // the parameter row itself must not render.
    const sectionWithoutDiagnosticAnnouncements = section.cloneNode(true);
    if (!(sectionWithoutDiagnosticAnnouncements instanceof HTMLElement)) {
      return null;
    }
    for (const announcement of sectionWithoutDiagnosticAnnouncements.querySelectorAll(
      '[data-setta-workspace-item-diagnostic-announcer="true"]',
    )) {
      announcement.remove();
    }
    return {
      callableValue: callable.textContent ?? "",
      generatedSource: generated.textContent ?? "",
      parameterLabel: label.textContent ?? "",
      parameterValue: parameter.textContent ?? "",
      sectionText: sectionWithoutDiagnosticAnnouncements.textContent ?? "",
    };
  })()`;
}

// The developer exercised the application from a raw launch instead of the capture harness's
// prepared state and found that the harness had certified an experience no first render produces:
// the backend booted an empty callable and the field painted `math.sqrt` as placeholder copy. This
// runs before the walkthrough mutates anything, and it compares the rendered surface against the
// canonical response rather than against a remembered string, so a placeholder standing in for a
// value fails it.
async function assertRawFirstRender(client, backendOrigin, callableLabel) {
  const canonical = await fetchCanonicalSnapshot(backendOrigin);
  const parameter = assertShippedExampleIsAlreadyCommitted(canonical);
  const rendered = await waitFor(
    client,
    "the shipped example's committed callable and parameter on the first render",
    renderedSectionValuesScript(callableLabel, `${parameter.name} expression`),
  );
  assertRenderedSectionIsCanonical(rendered, canonical, parameter);
}

// The Go service commits the demo through its own store before it answers a request, so the very
// first response is already canonical rather than an empty callable a test has to fill in.
function assertShippedExampleIsAlreadyCommitted(canonical) {
  const committed = {
    callable: canonical.callables?.[0]?.authoredExpression ?? null,
    generatesItsCall:
      canonical.generatedCode?.code?.includes(
        "state.Square_Root = math.sqrt()",
      ) === true,
    parameterNames: (canonical.parameters ?? []).map(
      (parameter) => parameter.name,
    ),
  };
  assertCanonicalValue(
    shippedExample,
    committed,
    `The first canonical response committed ${JSON.stringify(committed)} instead of the shipped example's ${JSON.stringify(shippedExample)}.`,
  );
  return canonical.parameters[0];
}

// Everything the section shows is the canonical project's own text. `math.sqrt` has no default, so
// its parameter's canonical expression is empty and the row must render an empty value rather than
// an invented `Python expression` placeholder.
function assertRenderedSectionIsCanonical(rendered, canonical, parameter) {
  assertRenderedValueIsCanonical(
    "callable field",
    rendered.callableValue,
    canonical.callables[0].authoredExpression,
  );
  assertRenderedValueIsCanonical(
    `${parameter.name} value editor`,
    rendered.parameterValue,
    parameter.authoredExpression,
  );
  assertRenderedValueIsCanonical(
    "generated Python reader",
    rendered.generatedSource,
    // The reader lays each line out as its own block, so its text carries the canonical lines in
    // order without the newlines between them.
    canonical.generatedCode.code.split("\n").join(""),
  );
  if (rendered.parameterLabel !== parameter.name) {
    throw new Error(
      `The parameter row labelled itself ${JSON.stringify(rendered.parameterLabel)} instead of the canonical name ${JSON.stringify(parameter.name)}.`,
    );
  }
  const spelled = analyzerRowSpellings.filter((spelling) =>
    rendered.sectionText.includes(spelling),
  );
  if (spelled.length > 0) {
    throw new Error(
      `The Square Root section exposed raw analyzer metadata: ${spelled.join(", ")}.`,
    );
  }
}

function assertRenderedValueIsCanonical(control, rendered, canonical) {
  if (rendered !== canonical) {
    throw new Error(
      `The ${control} rendered ${JSON.stringify(rendered)} on the first render while the canonical project holds ${JSON.stringify(canonical)}.`,
    );
  }
}

function toolbarButtonNamesScript(toolbarExpression) {
  return `Array.from(${toolbarExpression}.querySelectorAll("button"), (button) =>
    button.getAttribute("aria-label") ?? button.textContent?.trim() ?? "",
  )`;
}

// The corrected composition: the callable editor leads the section, the Args toolbar follows it in
// the ordinary authoring mode, the parameter list follows the toolbar, and an ordinary idle section
// says nothing about the provider.
async function assertCallableFirstComposition(client, callableLabel) {
  const composition = await evaluate(
    client,
    `(() => {
      const section = document.querySelector(${JSON.stringify(callableSectionSelector)});
      const editor = section?.querySelector(${JSON.stringify(textBoxSelector(callableLabel))});
      const toolbar = section?.querySelector(${JSON.stringify(itemToolbarSelector)});
      const list = section?.querySelector(${JSON.stringify(callableContentSelector)});
      if (
        !(editor instanceof HTMLElement) ||
        !(toolbar instanceof HTMLElement) ||
        !(list instanceof HTMLElement)
      ) {
        return null;
      }
      const precedes = (first, second) =>
        (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
      return {
        alertCount: section.querySelectorAll('[role="alert"]').length,
        editorPrecedesToolbar: precedes(editor, toolbar),
        mentionsProvider: section.textContent?.includes("Basedpyright") === true,
        toolbarButtonNames: ${toolbarButtonNamesScript("toolbar")},
        toolbarMode: toolbar.getAttribute("data-workspace-item-toolbar"),
        toolbarPrecedesList: precedes(toolbar, list),
        toolbarText: toolbar.textContent?.trim() ?? "",
      };
    })()`,
  );
  if (composition === null) {
    throw new Error(
      "The Square Root section did not render its callable editor, Args toolbar, and parameter list.",
    );
  }
  if (!composition.editorPrecedesToolbar || !composition.toolbarPrecedesList) {
    throw new Error(
      "The Square Root section must render the callable editor, then the Args toolbar, then the parameter list.",
    );
  }
  if (composition.toolbarMode !== "authoring-and-filter") {
    throw new Error(
      `The Args toolbar rendered in ${JSON.stringify(composition.toolbarMode)} instead of authoring-and-filter.`,
    );
  }
  if (!composition.toolbarText.includes("Args")) {
    throw new Error("The Args toolbar no longer labels the Args area.");
  }
  assertStructuralParameterControls(composition.toolbarButtonNames);
  if (composition.mentionsProvider || composition.alertCount > 0) {
    throw new Error(
      "The idle Square Root section still renders provider-status prose.",
    );
  }
}

// The developer rejected the previous candidate because clicking the callable field changed its
// dimensions and its type. Measure the donor pill idle, click it, and require that the same
// surface comes back with only its border colour changed.
async function assertCallableFieldActivationParity(client, callableLabel) {
  await waitForIdleCallableField(client, callableLabel);
  const idle = await evaluate(
    client,
    callableFieldStateScript(idleCallableSelector(callableLabel)),
  );
  if (idle === null) {
    throw new Error("The idle callable field did not render its surface.");
  }
  assertDonorCallableFieldSurface(idle, walkthroughAppearance);

  await enterCallableField(client, callableLabel);
  const live = await evaluate(
    client,
    callableFieldStateScript(liveCallableSelector(callableLabel)),
  );
  if (live === null) {
    throw new Error("The live callable field did not render its surface.");
  }
  assertCallableFieldParity(
    idle,
    live,
    fieldTypeProperties,
    walkthroughAppearance,
  );

  await pressEscape(client);
  await waitFor(
    client,
    "the callable field returning to its idle layer",
    `document.querySelector(${JSON.stringify(liveCallableSelector(callableLabel))}) === null`,
  );
}

// The developer rejected one candidate because Generated Python exposed a black caret line inside
// output nobody could author, the supervisor rejected the next because its region filled the
// section's unused height with a corner badge, and the developer rejected the third because the
// region claimed the target's authored prefix and suffix. Measure the generated block idle, click
// it with a real pointer, and require the same region-bounded block over an editor whose caret
// stays outside it.
async function assertGeneratedDocumentPresentation(client, generatedLabel) {
  const idle = await evaluate(client, generatedDocumentStateScript);
  if (idle === null) {
    throw new Error(
      `${generatedLabel} did not render the package's generated-document surface.`,
    );
  }
  assertDonorGeneratedRegion(idle, walkthroughAppearance);
  assertGeneratedBlockHugsCode("The idle", idle);
  assertGeneratedRegionBoundsItsBody("The idle", idle);
  assertAuthorableGeneratedDocument("The idle", idle);

  await clickElementCenter(
    client,
    generatedDocumentSelector,
    "The generated Python region",
  );
  const clicked = await evaluate(client, generatedDocumentStateScript);
  if (clicked === null) {
    throw new Error("The clicked generated Python region lost its surface.");
  }
  assertGeneratedBlockHugsCode("The clicked", clicked);
  assertGeneratedRegionBoundsItsBody("The clicked", clicked);
  assertAuthorableGeneratedDocument("The clicked", clicked);
  for (const [property, idleValue] of Object.entries(idle.region)) {
    if (clicked.region[property] !== idleValue) {
      throw new Error(
        `Clicking generated Python changed ${property} from ${JSON.stringify(idleValue)} to ${JSON.stringify(clicked.region[property])}.`,
      );
    }
  }

  await dragSelectElement(
    client,
    `${generatedDocumentSelector} [role="textbox"]`,
    "The generated Python text",
  );
  const selected = await evaluate(
    client,
    `window.getSelection()?.toString() ?? ""`,
  );
  if (!selected.includes("class SettaState:")) {
    throw new Error(
      "Generated Python text could not be selected by a real pointer drag.",
    );
  }
  return idle.text.source;
}

// The developer exercised the app at an enlarged canvas zoom and found settled content blurred by
// a compositor layer the package left on every hovered section, and a horizontal line across the
// focused callable pill. Both are judged here, in a fresh scene before this walkthrough mutates
// anything, because both are about what the shipped canvas paints rather than about a value the
// project holds.
async function assertSettledZoomPresentation(client, callableLabel) {
  const zoomed = await zoomCanvasOnCallableCard(client);
  assertSettledSectionIsNotPromoted("The zoomed", zoomed);
  // The enlarged card is also the state the evidence photographs, so it has to be a state a
  // photograph can hold: the complete header-to-parameter composition inside the canvas rather
  // than partly under the application's status strip.
  assertSettledCardIsInsideCanvas("The zoomed", zoomed);

  // The line was the top border of a completion popup the section's own box cropped, so the popup
  // is opened at that same enlarged zoom and measured against the field it belongs to.
  await replaceCallableDraft(client, callableLabel, otherCallable.draft);
  await waitForCallableCompletion(client, otherCallable.completion);
  const popup = await readPlacedCallableCompletionPopup(client, "The zoomed");
  assertCompletionPopupEscapesTheSection("The zoomed", popup);

  // The popup takes the first Escape, the draft goes back to the canonical value on the second,
  // and the settled card is still unpromoted with the field focused.
  await pressEscape(client);
  await waitForClosedCallableCompletion(client);
  await pressEscape(client);
  await waitForIdleCallableValue(
    client,
    callableLabel,
    shippedExample.callable,
  );
  const edited = await readSettledSectionState(client, "The zoomed and edited");
  assertSettledSectionIsNotPromoted("The zoomed and edited", edited);
  assertSettledCardIsInsideCanvas("The zoomed and edited", edited);
}

// Rendered order alone would not prove the section reads correctly by keyboard. Start from the last
// ordinary focus target before the callable field, enter the field with a real Tab key, and prove
// its keyboard activation mounts the live editor before the next Tab reaches the Args filter.
async function assertCallableEditorLeadsKeyboardOrder(client, callableLabel) {
  await waitForIdleCallableField(client, callableLabel);
  const precedingControlFocused = await evaluate(
    client,
    `(() => {
      const section = document.querySelector(${JSON.stringify(callableSectionSelector)});
      const control = document.querySelector(${JSON.stringify(textBoxSelector(callableLabel))});
      if (!(section instanceof HTMLElement) || !(control instanceof HTMLElement)) {
        return false;
      }
      const focusable = Array.from(section.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      )).filter((candidate) =>
        candidate instanceof HTMLElement &&
        candidate !== control &&
        candidate.getClientRects().length > 0 &&
        (candidate.compareDocumentPosition(control) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
      );
      const preceding = focusable.at(-1);
      if (!(preceding instanceof HTMLElement)) {
        return false;
      }
      preceding.focus({ preventScroll: true });
      return document.activeElement === preceding;
    })()`,
  );
  if (!precedingControlFocused) {
    throw new Error(
      "No focusable section control preceded the callable editor.",
    );
  }
  await pressTab(client);
  await waitFor(
    client,
    "live callable editor activation through keyboard traversal",
    `Array.from(document.querySelectorAll(${JSON.stringify(labeledSelector(callableLabel))})).some((control) =>
      control instanceof HTMLElement &&
      control.getAttribute("contenteditable") === "true" &&
      document.activeElement === control
    )`,
  );
  await pressTab(client);
  const focused = await waitFor(
    client,
    "keyboard focus moving from the callable editor into the Args toolbar",
    `(() => {
      const active = document.activeElement;
      if (
        !(active instanceof HTMLElement) ||
        active.closest(${JSON.stringify(itemToolbarSelector)}) === null
      ) {
        return null;
      }
      return {
        name:
          active.labels?.[0]?.textContent?.trim() ??
          active.getAttribute("aria-label") ??
          "",
      };
    })()`,
  );
  // The authoring toolbar opens with its own actions, so the control after the field is the
  // toolbar's first one rather than its filter. What this proves is that the field leads the
  // section by keyboard, not which toolbar control comes first inside the package's own surface.
  if (focused.name !== firstStructuralControlName) {
    throw new Error(
      `Tab from the callable editor reached ${JSON.stringify(focused.name)} instead of the Args toolbar's ${firstStructuralControlName}.`,
    );
  }
}

// The filter advertises the workspace binding that focuses it, and that exact chord does. The
// label comes from the package's own binding registry, so the app spells no shortcut of its own.
// The chord is pressed from inside the card, which is where a person is when they reach for it.
async function assertArgsFilterAdvertisesAndAnswersItsBinding(
  client,
  callableLabel,
) {
  // Entering the field is what puts a person inside the card, and it waits for that entry to
  // settle so the chord's own focus move is the last one this step makes.
  await enterCallableField(client, callableLabel);
  const idle = await evaluate(
    client,
    withFilterControls(`
      return {
        alreadyFocused: document.activeElement === controls.input,
        name: controls.input.labels?.[0]?.textContent?.trim(),
        placeholder: controls.input.placeholder,
      };
    `),
  );
  if (idle === null) {
    throw new Error("The Args toolbar rendered no parameter filter.");
  }
  if (idle.alreadyFocused) {
    throw new Error(
      "The Args filter already held focus, so this cannot prove the binding moved it.",
    );
  }
  if (idle.placeholder !== filterChord) {
    throw new Error(
      `The active section's empty filter showed ${JSON.stringify(idle.placeholder)} instead of ${JSON.stringify(filterChord)}.`,
    );
  }
  if (idle.name !== "Filter parameters") {
    throw new Error(
      `The advertised shortcut replaced the filter's accessible name with ${JSON.stringify(idle.name)}.`,
    );
  }

  await pressModifierK(client);
  await waitFor(
    client,
    `the ${filterChord} binding focusing the Args filter`,
    withFilterControls("return document.activeElement === controls.input;"),
  );
}

// The retained filter still has to work, and it filters on the text the app projects for its own
// opaque rows rather than on package-owned labels.
async function assertArgsFilterRemainsOperable(client, parameterLabel) {
  const focused = await evaluate(
    client,
    withFilterControls(`
      controls.input.focus({ preventScroll: true });
      return document.activeElement === controls.input;
    `),
  );
  if (focused !== true) {
    throw new Error(
      "The Args toolbar did not expose a focusable parameter filter.",
    );
  }
  await insertText(client, "zzz");
  await waitFor(
    client,
    "the Args filter hiding a non-matching parameter",
    withFilterControls(`
      const parameter = document.querySelector(${JSON.stringify(textBoxSelector(parameterLabel))});
      return !(parameter instanceof HTMLElement) &&
        controls.status?.textContent?.trim() === "0 matching parameters.";
    `),
  );
  const names = await evaluate(
    client,
    withFilterControls(
      `return ${toolbarButtonNamesScript("controls.toolbar")};`,
    ),
  );
  if (names === null) {
    throw new Error("The Args toolbar disappeared while filtering.");
  }
  assertStructuralParameterControls(names);
  const cleared = await evaluate(
    client,
    `(() => {
      const button = document.querySelector('[aria-label="Clear parameter filter"]');
      if (!(button instanceof HTMLElement)) {
        return false;
      }
      button.click();
      return true;
    })()`,
  );
  if (!cleared) {
    throw new Error("The active Args filter exposed no clear control.");
  }
  await waitFor(
    client,
    "the cleared Args filter restoring the parameter row",
    withFilterControls(`
      const parameter = document.querySelector(${JSON.stringify(textBoxSelector(parameterLabel))});
      return parameter instanceof HTMLElement && controls.input.value === "";
    `),
  );
}

// Main's callable search: Tab accepts an offer into the draft without committing, one unmodified
// Enter commits the draft the field is showing even while the popup is open, and the Escape that
// gets past the popup abandons the draft for the canonical name.
//
// Every step drives a second real callable through the field. The demo now boots on `math.sqrt`,
// so a sequence that starts and ends there proves nothing: the store returns early when a commit
// repeats the expression it already holds, and a wait for the committed projection is satisfied
// before the key is even pressed. Only the last step returns the project to the shipped example.
async function assertCallableKeysMatchMain(
  client,
  backendOrigin,
  callableLabel,
  generatedLabel,
  generatedSource,
) {
  const shipped = await fetchCanonicalSnapshot(backendOrigin);

  await replaceCallableDraft(client, callableLabel, otherCallable.draft);
  await waitForCallableCompletion(client, otherCallable.completion);
  await pressEscape(client);
  await waitForClosedCallableCompletion(client);
  // The popup takes the first Escape for itself, as it does in main, so the draft is still here.
  await waitForCallableDraft(client, callableLabel, otherCallable.draft);
  await pressEscape(client);
  await waitForIdleCallableValue(
    client,
    callableLabel,
    shippedExample.callable,
  );
  assertCanonicalProjectUnchanged(
    "Abandoning a callable draft",
    shipped,
    await fetchCanonicalSnapshot(backendOrigin),
  );

  await replaceCallableDraft(client, callableLabel, otherCallable.draft);
  await waitForCallableCompletion(client, otherCallable.completion);
  await pressTab(client);
  await waitForCallableDraft(client, callableLabel, otherCallable.callable);
  await waitFor(
    client,
    "the accepted completion leaving generated Python alone",
    `(() => {
      const generated = document.querySelector(${JSON.stringify(labeledSelector(generatedLabel))});
      return generated?.querySelector('[role="textbox"]')?.textContent === ${JSON.stringify(generatedSource)};
    })()`,
  );
  assertCanonicalProjectUnchanged(
    "Accepting a completion with Tab",
    shipped,
    await fetchCanonicalSnapshot(backendOrigin),
  );

  // One Enter on the accepted draft, with no popup left to blame for it.
  await pressEnter(client);
  await assertCommittedCallable(client, backendOrigin, {
    callableLabel,
    expression: otherCallable.callable,
    generatedLabel,
  });

  // And one Enter over an open popup, which is the press the rejected candidate spent on the
  // completion and made a person repeat.
  await replaceCallableDraft(client, callableLabel, shippedExample.callable);
  await waitForCallableCompletion(client, shippedCompletionLabel);
  await pressEnter(client);
  await assertCommittedCallable(client, backendOrigin, {
    callableLabel,
    expression: shippedExample.callable,
    generatedLabel,
  });
}

// A commit is canonical when the store holds the new expression and the reader shows the call it
// generates. Leaving the field afterwards proves the same value survives the Escape that abandons
// an uncommitted draft.
async function assertCommittedCallable(
  client,
  backendOrigin,
  { callableLabel, expression, generatedLabel },
) {
  await waitFor(
    client,
    `the ${expression} call in generated Python`,
    `(() => {
      const generated = document.querySelector(${JSON.stringify(labeledSelector(generatedLabel))});
      return generated?.textContent?.includes(${JSON.stringify(`state.Square_Root = ${expression}()`)}) === true;
    })()`,
  );
  const canonical = await fetchCanonicalSnapshot(backendOrigin);
  const committed = canonical.callables?.[0]?.authoredExpression ?? null;
  if (committed !== expression) {
    throw new Error(
      `One Enter left the canonical callable at ${JSON.stringify(committed)} instead of committing ${JSON.stringify(expression)}.`,
    );
  }
  await pressEscape(client);
  await waitForIdleCallableValue(client, callableLabel, expression);
}

async function waitForAccessibleControls(
  client,
  callableLabel,
  generatedLabel,
) {
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
}

async function runWalkthrough(client, backendOrigin, previewOrigin) {
  const callableLabel = "Callable expression";
  const parameterLabel = "x expression";
  const generatedLabel =
    "Generated Python code editor, generated output read-only";

  await waitForAccessibleControls(client, callableLabel, generatedLabel);

  await assertRawFirstRender(client, backendOrigin, callableLabel);
  // The zoom states are judged in this untouched scene, before anything below edits a draft or
  // commits a callable, and the page is then reloaded so the rest measures the shipped 1x
  // composition rather than whatever the gesture left behind.
  await assertSettledZoomPresentation(client, callableLabel);
  await navigate(client, previewOrigin);
  await waitForAccessibleControls(client, callableLabel, generatedLabel);

  await assertCallableFirstComposition(client, callableLabel);
  await assertCallableFieldActivationParity(client, callableLabel);
  await assertCallableEditorLeadsKeyboardOrder(client, callableLabel);

  const generatedSource = await assertGeneratedDocumentPresentation(
    client,
    generatedLabel,
  );
  await assertCallableKeysMatchMain(
    client,
    backendOrigin,
    callableLabel,
    generatedLabel,
    generatedSource,
  );

  await waitFor(
    client,
    "math.sqrt callable projection",
    `(() => {
      const parameter = document.querySelector(${JSON.stringify(textBoxSelector(parameterLabel))});
      const generated = document.querySelector(${JSON.stringify(labeledSelector(generatedLabel))});
      return parameter instanceof HTMLElement &&
        parameter.getAttribute("aria-disabled") !== "true" &&
        generated?.textContent?.includes("state.Square_Root = math.sqrt()") === true;
    })()`,
  );

  await activateTextBox(client, parameterLabel);
  await insertText(client, "missing_value");
  await waitFor(
    client,
    "mapped undefined-name diagnostic",
    `(() => {
      const generated = document.querySelector(${JSON.stringify(labeledSelector(generatedLabel))});
      const diagnostic = Array.from(document.querySelectorAll('[role="status"]')).some((element) =>
        element.textContent?.includes("Parameter diagnostics available."),
      );
      return generated?.textContent?.includes("state.Square_Root__x = missing_value") === true && diagnostic;
    })()`,
  );

  await waitFor(
    client,
    "enabled parameter textbox after mapped undefined-name diagnostic",
    `(() => {
      const parameter = document.querySelector(${JSON.stringify(textBoxSelector(parameterLabel))});
      return parameter instanceof HTMLElement &&
        parameter.getAttribute("aria-disabled") !== "true" &&
        parameter.getAttribute("aria-readonly") !== "true";
    })()`,
  );

  await activateTextBox(client, parameterLabel);
  await selectAll(client);
  await insertText(client, "3");
  await waitFor(
    client,
    "cleared parameter diagnostic",
    `(() => {
      const generated = document.querySelector(${JSON.stringify(labeledSelector(generatedLabel))});
      const cleared = Array.from(document.querySelectorAll('[role="status"]')).some((element) =>
        element.textContent?.includes("Parameter diagnostics cleared."),
      );
      return generated?.textContent?.includes("state.Square_Root__x = 3") === true &&
        generated?.textContent?.includes("missing_value") === false && cleared;
    })()`,
  );

  // The developer rejected a candidate whose callable field measured correctly while the card
  // around it did not, so the complete committed card is measured as one stack here — the state
  // main's own reference capture shows.
  const cardComposition = await evaluate(client, callableSectionStateScript);
  if (cardComposition === null) {
    throw new Error(
      "The Square Root card did not render its complete header, field, toolbar, and parameter stack.",
    );
  }
  assertDonorSectionComposition(cardComposition, walkthroughAppearance);

  await assertArgsFilterAdvertisesAndAnswersItsBinding(client, callableLabel);
  await assertArgsFilterRemainsOperable(client, parameterLabel);
  // Real argument authoring, which the rejected filter-only candidate did not offer at all.
  await assertAuthoredParameterAuthoring(client, backendOrigin, generatedLabel);
  await assertCallableDiagnosticPresentation(
    client,
    backendOrigin,
    callableLabel,
    generatedLabel,
  );
  await assertTargetlessDocumentDiagnostic(
    client,
    backendOrigin,
    generatedLabel,
  );
  // Real Python authoring around the generated body, which the rejected whole-document read-only
  // candidate did not offer at all. It runs last because it reloads the page.
  await assertAuthoredPythonAroundTheGeneratedBody(
    client,
    backendOrigin,
    previewOrigin,
    generatedLabel,
  );
  // The field has to keep the donor surface after a real edit round trip, not only on first paint.
  await assertCallableFieldActivationParity(client, callableLabel);
}

function assertCanonicalProjectUnchanged(stage, before, after) {
  assertCanonicalValue(
    before.project?.revision,
    after.project?.revision,
    `${stage} changed the canonical project revision.`,
  );
  assertCanonicalValue(
    before.callables,
    after.callables,
    `${stage} committed or otherwise changed canonical callable records.`,
  );
  assertCanonicalValue(
    before.parameters,
    after.parameters,
    `${stage} created or changed a canonical parameter.`,
  );
  assertCanonicalValue(
    before.generatedCode,
    after.generatedCode,
    `${stage} changed the canonical generated code.`,
  );
  assertCanonicalValue(
    before.diagnostics,
    after.diagnostics,
    `${stage} changed canonical diagnostics.`,
  );
}

function assertCanonicalValue(before, after, message) {
  if (JSON.stringify(after) !== JSON.stringify(before)) {
    throw new Error(message);
  }
}

async function main() {
  await runAgainstProductionApp(
    async ({ backendOrigin, client, previewOrigin }) => {
      await setEmulatedAppearance(client, walkthroughAppearance);
      await navigate(client, previewOrigin);
      await runWalkthrough(client, backendOrigin, previewOrigin);
    },
  );
  console.log("Python Canvas browser vertical slice passed.");
}

await main();
