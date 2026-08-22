import { setTimeout as delay } from "node:timers/promises";

import {
  fetchCanonicalSnapshot,
  productionTimeoutMs,
} from "./browser-processes.mjs";
import {
  activateTextBox,
  clickElementCenter,
  evaluate,
  insertText,
  labeledSelector,
  pressEscape,
  textBoxSelector,
  waitFor,
} from "./browser-page.mjs";
import {
  callableFieldStateScript,
  enterCallableField,
  fieldTypeProperties,
  idleCallableSelector,
  liveCallableSelector,
  waitForIdleCallableField,
} from "./callable-presentation.mjs";

// An unexpected keyword on the otherwise valid `math.sqrt` call is a callable-targeted provider
// error. It must be a compact, accessible field state—not a duplicate document underline—and it
// must remain exactly that state while the editable CodeMirror layer is active.
export async function assertCallableDiagnosticPresentation(
  client,
  backendOrigin,
  callableLabel,
  generatedLabel,
) {
  await assertExpectedProviderParameter(backendOrigin);
  await addUnexpectedKeywordParameter(client);
  const diagnosticMessage = await readCallableDiagnostic(backendOrigin);
  await assertCallableDiagnosticField(client, callableLabel, diagnosticMessage);
  await clearCallableDiagnostic(
    client,
    backendOrigin,
    callableLabel,
    generatedLabel,
    diagnosticMessage,
  );
}

async function assertExpectedProviderParameter(backendOrigin) {
  const before = await fetchCanonicalSnapshot(backendOrigin);
  if (before.parameters?.length !== 1 || before.parameters[0]?.name !== "x") {
    throw new Error(
      "The callable diagnostic walkthrough requires the restored provider x parameter.",
    );
  }
}

async function addUnexpectedKeywordParameter(client) {
  await clickElementCenter(
    client,
    labeledSelector("Add parameter"),
    "the Add parameter control for a callable diagnostic",
  );
  await waitFor(
    client,
    "the added parameter name editor",
    editableTextBoxScript("Item name"),
  );
  await activateTextBox(client, "Item name");
  await insertText(client, "scale");
  await waitFor(
    client,
    "the named parameter expression editor",
    editableTextBoxScript("scale expression"),
  );
  await activateTextBox(client, "scale expression");
  await insertText(client, "2");
}

function editableTextBoxScript(label) {
  return `(() => {
    const control = document.querySelector(${JSON.stringify(textBoxSelector(label))});
    return control instanceof HTMLElement && control.getAttribute("aria-disabled") !== "true";
  })()`;
}

async function readCallableDiagnostic(backendOrigin) {
  const diagnosed = await waitForCanonicalSnapshot(
    backendOrigin,
    "the callable-targeted unexpected-keyword diagnostic",
    hasCallableDiagnostic,
  );
  const callableId = diagnosed.callables?.[0]?.id;
  if (typeof callableId !== "string") {
    throw new Error(
      "The canonical project published no callable for its diagnostic.",
    );
  }
  const message = diagnosed.diagnostics
    .filter((diagnostic) => diagnostic.targetId === callableId)
    .map((diagnostic) => diagnostic.message)
    .join("\n");
  if (message === "") {
    throw new Error("The callable-targeted diagnostic had no message.");
  }
  return message;
}

function hasCallableDiagnostic(snapshot) {
  const callableId = snapshot.callables?.[0]?.id;
  return (
    typeof callableId === "string" &&
    snapshot.diagnostics.some(
      (diagnostic) => diagnostic.targetId === callableId,
    )
  );
}

async function assertCallableDiagnosticField(client, callableLabel, message) {
  const idle = await readDiagnosticField(
    client,
    "idle",
    idleCallableSelector(callableLabel),
    callableLabel,
    message,
  );
  await enterCallableField(client, callableLabel);
  const live = await readDiagnosticField(
    client,
    "live",
    liveCallableSelector(callableLabel),
    callableLabel,
    message,
  );
  assertCallableDiagnosticFieldParity(idle, live);
  await pressEscape(client);
  await waitForIdleCallableField(client, callableLabel);
}

async function readDiagnosticField(
  client,
  stage,
  textSelector,
  callableLabel,
  message,
) {
  await waitFor(
    client,
    `the callable field's ${stage} error treatment`,
    callableDiagnosticAccessibilityScript(textSelector, callableLabel, message),
  );
  const state = await evaluate(client, callableFieldStateScript(textSelector));
  if (state === null) {
    throw new Error(
      `The callable diagnostic did not leave a ${stage} field to inspect.`,
    );
  }
  assertCallableDiagnosticSurface(stage, state);
  return state;
}

async function clearCallableDiagnostic(
  client,
  backendOrigin,
  callableLabel,
  generatedLabel,
  message,
) {
  await clickElementCenter(
    client,
    labeledSelector("Remove last parameter"),
    "the parameter that created the callable diagnostic",
  );
  await waitForCanonicalSnapshot(
    backendOrigin,
    "the cleared callable diagnostic",
    hasClearedCallableDiagnostic,
  );
  await waitFor(
    client,
    "the callable field after its diagnostic clears",
    callableDiagnosticClearedScript(
      idleCallableSelector(callableLabel),
      callableLabel,
      message,
    ),
  );
  await waitFor(
    client,
    "generated Python without the removed unexpected keyword",
    `document.querySelector(${JSON.stringify(labeledSelector(generatedLabel))})?.textContent?.includes("scale=") === false`,
  );
}

function hasClearedCallableDiagnostic(snapshot) {
  const callableId = snapshot.callables?.[0]?.id;
  return (
    snapshot.parameters?.length === 1 &&
    snapshot.parameters[0]?.name === "x" &&
    typeof callableId === "string" &&
    snapshot.diagnostics.every(
      (diagnostic) => diagnostic.targetId !== callableId,
    )
  );
}

function callableDiagnosticAccessibilityScript(
  textSelector,
  callableLabel,
  message,
) {
  return `(() => {
    const field = document.querySelector("[data-workspace-section-field]");
    const text = document.querySelector(${JSON.stringify(textSelector)});
    if (!(field instanceof HTMLElement) || !(text instanceof HTMLElement)) {
      return false;
    }
    const descriptionId = text.getAttribute("aria-describedby");
    const description = descriptionId === null ? null : document.getElementById(descriptionId);
    const status = field.querySelector('[role="status"]');
    const indicator = field.querySelector('[aria-hidden="true"][title]');
    const indicatorRect = indicator?.getBoundingClientRect();
    return text.getAttribute("aria-label") === ${JSON.stringify(callableLabel)} &&
      text.getAttribute("aria-invalid") === "true" &&
      field.getAttribute("data-diagnostic") === "true" &&
      description?.textContent === ${JSON.stringify(`Error: ${message}`)} &&
      status?.textContent === ${JSON.stringify(`Error: ${message}`)} &&
      indicator?.getAttribute("title") === ${JSON.stringify(message)} &&
      indicatorRect !== undefined && indicatorRect.width > 0 && indicatorRect.height > 0;
  })()`;
}

function callableDiagnosticClearedScript(textSelector, callableLabel, message) {
  return `(() => {
    const field = document.querySelector("[data-workspace-section-field]");
    const text = document.querySelector(${JSON.stringify(textSelector)});
    if (!(field instanceof HTMLElement) || !(text instanceof HTMLElement)) {
      return false;
    }
    const descriptionId = text.getAttribute("aria-describedby");
    const description = descriptionId === null ? null : document.getElementById(descriptionId);
    const status = field.querySelector('[role="status"]');
    const indicator = Array.from(field.querySelectorAll('[aria-hidden="true"][title]')).some(
      (element) => element.getAttribute("title") === ${JSON.stringify(message)},
    );
    return text.getAttribute("aria-label") === ${JSON.stringify(callableLabel)} &&
      text.getAttribute("aria-invalid") !== "true" &&
      field.getAttribute("data-diagnostic") === "false" &&
      description === null &&
      status?.textContent === "" &&
      !indicator;
  })()`;
}

function assertCallableDiagnosticSurface(stage, state) {
  if (
    state.surface.backgroundColor !== "rgb(254, 202, 202)" ||
    state.borderColor !== "rgb(254, 202, 202)"
  ) {
    throw new Error(
      `The ${stage} callable error did not render the expected pale-red error surface: ${JSON.stringify(state)}.`,
    );
  }
}

function assertCallableDiagnosticFieldParity(idle, live) {
  for (const [property, idleValue] of Object.entries(idle.box)) {
    const drift = Math.abs(idleValue - live.box[property]);
    if (drift > 1) {
      throw new Error(
        `Activating the callable error field moved its ${property} by ${String(drift)} CSS px.`,
      );
    }
  }
  for (const property of fieldTypeProperties) {
    if (idle.type[property] !== live.type[property]) {
      throw new Error(
        `Activating the callable error field changed ${property} from ${JSON.stringify(idle.type[property])} to ${JSON.stringify(live.type[property])}.`,
      );
    }
  }
  for (const [property, idleValue] of Object.entries(idle.surface)) {
    if (idleValue !== live.surface[property]) {
      throw new Error(
        `Activating the callable error field changed ${property} from ${JSON.stringify(idleValue)} to ${JSON.stringify(live.surface[property])}.`,
      );
    }
  }
  if (idle.borderColor !== live.borderColor) {
    throw new Error(
      `Activating the callable error field changed its error border from ${JSON.stringify(idle.borderColor)} to ${JSON.stringify(live.borderColor)}.`,
    );
  }
}

async function waitForCanonicalSnapshot(backendOrigin, description, matches) {
  const deadline = Date.now() + productionTimeoutMs;
  let snapshot = null;
  while (Date.now() < deadline) {
    snapshot = await fetchCanonicalSnapshot(backendOrigin);
    if (matches(snapshot)) {
      return snapshot;
    }
    await delay(100);
  }
  throw new Error(
    `${description} did not reach the canonical project: ${JSON.stringify(snapshot?.diagnostics)}.`,
  );
}
