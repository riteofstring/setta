import assert from "node:assert/strict";

import { fetchCanonicalSnapshot } from "./browser-processes.mjs";
import {
  activateAndSelectAllContentEditableTextBox,
  activateCodeEditor,
  clickElementCenter,
  contentEditableTextBoxSelector,
  evaluate,
  insertText,
  labeledSelector,
  moveCaretToDocumentStart,
  pressEscape,
  waitFor,
} from "./browser-page.mjs";
import {
  waitForCallableUiIdle,
  waitForSnapshot,
} from "./callable-commit.browser.mjs";

const generatedPythonEditorSelector = labeledSelector(
  "Generated Python code editor, generated output read-only",
);

export async function exerciseResolvedMathCallableLifecycle(
  client,
  backendOrigin,
  name,
  harness,
) {
  const subject = { harness, name };
  await resolveMathParametersFromPythonTarget(
    client,
    backendOrigin,
    name,
    harness,
  );

  const resolved = await waitForSnapshot(
    backendOrigin,
    "the refreshed math.sqrt parameter diagnostic",
    (snapshot) => {
      const callable = harness.findCallable(snapshot, name);
      const parameter = callable?.parameters.find(
        (candidate) =>
          candidate.name === "x" && candidate.nameEditable === false,
      );
      return (
        callable !== null &&
        callable !== undefined &&
        parameter !== undefined &&
        snapshot.diagnostics.some(
          (diagnostic) =>
            diagnostic.targetId === parameter.id &&
            diagnostic.severity === "error",
        ) &&
        snapshot.diagnostics.every(
          (diagnostic) => diagnostic.targetId !== callable.id,
        )
      );
    },
  );
  const callable = harness.findRequiredCallable(resolved, name);
  const parameter = callable.parameters.find(
    (candidate) => candidate.name === "x" && !candidate.nameEditable,
  );
  assert.ok(
    parameter,
    "The resolved Python target did not restore the provider-derived x row.",
  );
  const missingArgument = resolved.diagnostics.find(
    (diagnostic) => diagnostic.targetId === parameter.id,
  );
  assert.ok(
    missingArgument,
    "The missing math.sqrt argument was not projected to x.",
  );
  await assertParameterDiagnosticPresentation(
    client,
    name,
    parameter.id,
    missingArgument.message,
    harness,
  );

  await setParameterExpression(client, backendOrigin, subject, parameter, {
    expression: "missing_value",
    inspectPendingPresentation: true,
  });
  const undefinedValue = await waitForSnapshot(
    backendOrigin,
    "the undefined x expression diagnostic",
    (snapshot) => {
      const current = harness.findCallable(snapshot, name);
      return (
        current?.parameters.find((candidate) => candidate.id === parameter.id)
          ?.authoredExpression === "missing_value" &&
        snapshot.diagnostics.some(
          (diagnostic) =>
            diagnostic.targetId === parameter.id &&
            /not defined|unknown/i.test(diagnostic.message),
        ) &&
        snapshot.diagnostics.every(
          (diagnostic) => diagnostic.targetId !== current.id,
        )
      );
    },
  );
  const undefinedDiagnostic = undefinedValue.diagnostics.find(
    (diagnostic) =>
      diagnostic.targetId === parameter.id &&
      /not defined|unknown/i.test(diagnostic.message),
  );
  assert.ok(undefinedDiagnostic, "The undefined x expression had no message.");
  await assertParameterDiagnosticPresentation(
    client,
    name,
    parameter.id,
    undefinedDiagnostic.message,
    harness,
  );

  await setParameterExpression(client, backendOrigin, subject, parameter, {
    expression: "3",
  });
  await waitForSnapshot(
    backendOrigin,
    "the valid x expression and cleared diagnostics",
    (snapshot) => {
      const current = harness.findCallable(snapshot, name);
      return (
        current?.parameters.find((candidate) => candidate.id === parameter.id)
          ?.authoredExpression === "3" &&
        snapshot.diagnostics.every(
          (diagnostic) =>
            diagnostic.targetId !== parameter.id &&
            diagnostic.targetId !== current.id,
        )
      );
    },
  );
  await assertDiagnosticPresentationCleared(
    client,
    name,
    parameter.id,
    harness,
  );

  const unexpected = await addAppParameter(
    client,
    backendOrigin,
    name,
    harness,
  );
  await setParameterName(
    client,
    backendOrigin,
    subject,
    unexpected.id,
    "unexpected",
  );
  await setParameterExpression(
    client,
    backendOrigin,
    subject,
    { ...unexpected, name: "unexpected" },
    { expression: "2" },
  );
  const unexpectedArgument = await waitForSnapshot(
    backendOrigin,
    "the callable-targeted unexpected argument diagnostic",
    (snapshot) => {
      const current = harness.findCallable(snapshot, name);
      return (
        current?.parameters.find((candidate) => candidate.id === unexpected.id)
          ?.authoredExpression === "2" &&
        snapshot.diagnostics.some(
          (diagnostic) =>
            diagnostic.targetId === current.id &&
            diagnostic.severity === "error",
        ) &&
        snapshot.diagnostics.every(
          (diagnostic) => diagnostic.targetId !== parameter.id,
        )
      );
    },
  );
  const callableDiagnostic = unexpectedArgument.diagnostics.find(
    (diagnostic) => diagnostic.targetId === callable.id,
  );
  assert.ok(
    callableDiagnostic,
    "The unsupported app-authored argument was not projected to the callable.",
  );
  await assertCallableDiagnosticPresentation(
    client,
    name,
    parameter.id,
    callableDiagnostic.message,
    harness,
  );

  await clickElementCenter(
    client,
    harness.callableToolbarButtonSelector(name, "Remove last parameter"),
    "the unsupported app-authored parameter removal",
  );
  await waitForSnapshot(
    backendOrigin,
    "the removed unsupported argument and cleared callable diagnostic",
    (snapshot) => {
      const current = harness.findCallable(snapshot, name);
      return (
        current !== null &&
        current.parameters.every(
          (candidate) => candidate.id !== unexpected.id,
        ) &&
        snapshot.diagnostics.every(
          (diagnostic) =>
            diagnostic.targetId !== current.id &&
            diagnostic.targetId !== parameter.id,
        )
      );
    },
  );
  await assertDiagnosticPresentationCleared(
    client,
    name,
    parameter.id,
    harness,
  );
}

async function resolveMathParametersFromPythonTarget(
  client,
  backendOrigin,
  name,
  harness,
) {
  const before = await fetchCanonicalSnapshot(backendOrigin);
  const callable = harness.findRequiredCallable(before, name);
  assert.equal(
    callable.authoredExpression,
    "math.sqrt",
    "The Python-target resolution path requires the unresolved math.sqrt callable.",
  );
  const refreshRequestsBefore = await parameterRefreshRequestCount(client);

  await activateCodeEditor(
    client,
    generatedPythonEditorSelector,
    "the Generated Python document for the math import",
  );
  await moveCaretToDocumentStart(client);
  await insertText(client, "import math\n");
  const resolved = await waitForSnapshot(
    backendOrigin,
    "the Python-target-resolved math.sqrt signature",
    (snapshot) => {
      const current = harness.findCallable(snapshot, name);
      return (
        snapshot.pythonTarget.prefix.startsWith("import math\n") &&
        current?.parameters.some(
          (parameter) => parameter.name === "x" && !parameter.nameEditable,
        ) === true &&
        snapshot.diagnostics.every(
          (diagnostic) => diagnostic.targetId !== current.id,
        )
      );
    },
  );
  assert.equal(
    await evaluate(
      client,
      "(document.querySelector('#python-canvas-mutation-error')?.textContent ?? '').trim()",
    ),
    "",
    "Automatically resolving the callable displayed a mutation error panel.",
  );
  assert.equal(
    await parameterRefreshRequestCount(client),
    refreshRequestsBefore,
    "Resolving the Python target issued a second, frontend-owned parameter refresh.",
  );
  assert.equal(
    harness.findRequiredCallable(resolved, name).authoredExpression,
    "math.sqrt",
    "Resolving the Python target replaced the persisted callable expression.",
  );
  assert.ok(
    resolved.generatedCode.body.includes("math.sqrt()"),
    "Generated Python did not contain the automatically refreshed math.sqrt call.",
  );
}

async function parameterRefreshRequestCount(client) {
  return evaluate(
    client,
    `performance.getEntriesByType("resource").filter((entry) => {
      try {
        return new URL(entry.name).pathname.endsWith("/refresh-parameters");
      } catch {
        return false;
      }
    }).length`,
  );
}

async function setParameterExpression(
  client,
  backendOrigin,
  subject,
  parameter,
  options,
) {
  const { expression, inspectPendingPresentation = false } = options;
  const { harness, name } = subject;
  const label = parameter.name === "" ? "Unnamed parameter" : parameter.name;
  if (inspectPendingPresentation) {
    await gateNextParameterMutationResponse(client);
  }
  await activateAndSelectAllContentEditableTextBox(
    client,
    harness.parameterRowSelector(parameter.id) +
      " " +
      contentEditableTextBoxSelector(label + " expression"),
    "the " + label + " expression editor",
  );
  await insertText(client, expression);
  await pressEscape(client);
  if (inspectPendingPresentation) {
    await assertParameterMutationHasNoListPendingPresentation(
      client,
      name,
      parameter.id,
      label,
      harness,
    );
    await releaseParameterMutationResponse(client);
  }
  await waitForSnapshot(
    backendOrigin,
    "the " + label + " expression " + expression,
    (snapshot) =>
      harness
        .findRequiredCallable(snapshot, name)
        .parameters.some(
          (candidate) =>
            candidate.id === parameter.id &&
            candidate.authoredExpression === expression,
        ),
  );
  await waitForCallableUiIdle(client, name, harness);
}

async function gateNextParameterMutationResponse(client) {
  const installed = await evaluate(
    client,
    "(() => {" +
      "if (window.__pythonCanvasParameterMutationGate !== undefined) return false;" +
      "const originalFetch = window.fetch;" +
      "let release;" +
      "const wait = new Promise((resolve) => { release = resolve; });" +
      "const gate = { intercepted: false, release: () => release(true) };" +
      "window.__pythonCanvasParameterMutationGate = gate;" +
      "window.fetch = async (...args) => {" +
      "const input = args[0];" +
      "const requestUrl = typeof input === 'string' || input instanceof URL ? String(input) : input.url;" +
      "const method = (args[1]?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();" +
      "const response = await originalFetch.apply(window, args);" +
      "if (!gate.intercepted && method === 'POST' && new URL(requestUrl, location.href).pathname.endsWith('/parameters')) {" +
      "gate.intercepted = true; await wait; window.fetch = originalFetch;" +
      "}" +
      "return response;" +
      "};" +
      "return true;" +
      "})()",
  );
  assert.equal(
    installed,
    true,
    "The parameter mutation response gate was not installed.",
  );
}

async function assertParameterMutationHasNoListPendingPresentation(
  client,
  name,
  parameterId,
  label,
  harness,
) {
  const sectionSelector = harness.callableSectionSelector(name);
  const rowSelector = harness.parameterRowSelector(parameterId);
  await waitFor(
    client,
    "the in-flight parameter value save without a parameter-list spinner",
    "(() => {" +
      "const section = document.querySelector(" +
      JSON.stringify(sectionSelector) +
      ");" +
      "const pendingBoundary = section?.querySelector('.python-canvas-callable-section');" +
      "const parameterArea = section?.querySelector('.python-canvas-callable-parameter-authoring');" +
      "const row = document.querySelector(" +
      JSON.stringify(rowSelector) +
      ");" +
      "const editor = row?.querySelector(" +
      JSON.stringify(contentEditableTextBoxSelector(label + " expression")) +
      ");" +
      "const overlay = section?.querySelector('[data-python-canvas-parameter-pending=true]');" +
      "const spinner = section?.querySelector('.python-canvas-parameter-spinner');" +
      "const lock = section?.querySelector('button[aria-label=\"Lock position and size\"]');" +
      "const unlock = section?.querySelector('button[aria-label=\"Unlock position and size\"]');" +
      "return window.__pythonCanvasParameterMutationGate?.intercepted === true &&" +
      "pendingBoundary instanceof HTMLElement && pendingBoundary.getAttribute('aria-busy') !== 'true' &&" +
      "parameterArea instanceof HTMLElement && !parameterArea.hasAttribute('inert') &&" +
      "row instanceof HTMLElement && editor instanceof HTMLElement &&" +
      "editor.getAttribute('aria-disabled') !== 'true' && overlay === null && spinner === null &&" +
      "lock instanceof HTMLElement && unlock === null;" +
      "})()",
  );
}

async function releaseParameterMutationResponse(client) {
  const released = await evaluate(
    client,
    "(() => {" +
      "const gate = window.__pythonCanvasParameterMutationGate;" +
      "if (gate?.intercepted !== true) return false;" +
      "gate.release();" +
      "delete window.__pythonCanvasParameterMutationGate;" +
      "return true;" +
      "})()",
  );
  assert.equal(
    released,
    true,
    "The parameter mutation response was not gated.",
  );
}

async function addAppParameter(client, backendOrigin, name, harness) {
  const callable = harness.findRequiredCallable(
    await fetchCanonicalSnapshot(backendOrigin),
    name,
  );
  const beforeIds = new Set(
    callable.parameters.map((parameter) => parameter.id),
  );
  await clickElementCenter(
    client,
    harness.callableToolbarButtonSelector(name, "Add parameter"),
    "the unsupported app-authored parameter control",
  );
  const snapshot = await waitForSnapshot(
    backendOrigin,
    "the unsupported app-authored parameter",
    (candidate) =>
      harness
        .findRequiredCallable(candidate, name)
        .parameters.some(
          (parameter) =>
            !beforeIds.has(parameter.id) && parameter.nameEditable === true,
        ),
  );
  await waitForCallableUiIdle(client, name, harness);
  const added = harness
    .findRequiredCallable(snapshot, name)
    .parameters.find((parameter) => !beforeIds.has(parameter.id));
  assert.ok(added, "The app-authored parameter was not persisted.");
  return added;
}

async function setParameterName(
  client,
  backendOrigin,
  subject,
  parameterId,
  name,
) {
  const { harness, name: callableName } = subject;
  await activateAndSelectAllContentEditableTextBox(
    client,
    harness.parameterRowSelector(parameterId) +
      " " +
      contentEditableTextBoxSelector("Item name"),
    "the app-authored parameter name",
  );
  await insertText(client, name);
  await pressEscape(client);
  await waitForSnapshot(
    backendOrigin,
    "the app-authored parameter name",
    (snapshot) =>
      harness
        .findRequiredCallable(snapshot, callableName)
        .parameters.some(
          (parameter) =>
            parameter.id === parameterId && parameter.name === name,
        ),
  );
  await waitForCallableUiIdle(client, callableName, harness);
}

async function assertParameterDiagnosticPresentation(
  client,
  name,
  parameterId,
  message,
  harness,
) {
  const expression = callableUiStateExpression(name, parameterId, harness);
  await waitFor(
    client,
    "the x-row diagnostic with an ordinary callable field",
    "(() => { const state = " +
      expression +
      "; return state !== null && state.parameterSeverity === 'error' &&" +
      "state.markerSeverity === 'error' && state.markerVisible === true &&" +
      "state.description.includes(" +
      JSON.stringify(message) +
      ") && state.fieldDiagnostic === 'false' && state.fieldInvalid !== 'true'; })()",
  );
  const state = await evaluate(client, expression);
  assert.equal(state.labelText, "x");
  assert.equal(state.labelTitle, null);
  assert.equal(state.metadataPresent, false);
  assert.equal(state.staticMetadata, false);
  assert.equal(state.fieldIndicatorTitle, null);
  assert.equal(state.mutationError, "");
  assert.equal(state.visibleAlert, false);
}

async function assertCallableDiagnosticPresentation(
  client,
  name,
  parameterId,
  message,
  harness,
) {
  const expression = callableUiStateExpression(name, parameterId, harness);
  await waitFor(
    client,
    "the callable-targeted unsupported-argument diagnostic",
    "(() => { const state = " +
      expression +
      "; return state !== null && state.parameterSeverity === null &&" +
      "state.fieldDiagnostic === 'true' && state.fieldInvalid === 'true' &&" +
      "state.fieldIndicatorTitle?.includes(" +
      JSON.stringify(message) +
      ") === true && state.fieldDescription.includes(" +
      JSON.stringify(message) +
      "); })()",
  );
  const state = await evaluate(client, expression);
  assert.equal(state.labelText, "x");
  assert.equal(state.metadataPresent, false);
  assert.equal(state.staticMetadata, false);
  assert.equal(state.mutationError, "");
  assert.equal(state.visibleAlert, false);
}

async function assertDiagnosticPresentationCleared(
  client,
  name,
  parameterId,
  harness,
) {
  const expression = callableUiStateExpression(name, parameterId, harness);
  await waitFor(
    client,
    "the cleared callable and x-row diagnostics",
    "(() => { const state = " +
      expression +
      "; return state !== null && state.parameterSeverity === null &&" +
      "state.markerSeverity === null && state.fieldDiagnostic === 'false' &&" +
      "state.fieldInvalid !== 'true' && state.fieldIndicatorTitle === null; })()",
  );
  const state = await evaluate(client, expression);
  assert.equal(state.labelText, "x");
  assert.equal(state.metadataPresent, false);
  assert.equal(state.staticMetadata, false);
  assert.equal(state.mutationError, "");
  assert.equal(state.visibleAlert, false);
}

function callableUiStateExpression(name, parameterId, harness) {
  const sectionSelector = harness.callableSectionSelector(name);
  const rowSelector = harness.parameterRowSelector(parameterId);
  const fieldSelector = contentEditableTextBoxSelector("Callable expression");
  return (
    "(() => {" +
    "const section = document.querySelector(" +
    JSON.stringify(sectionSelector) +
    ");" +
    "const row = document.querySelector(" +
    JSON.stringify(rowSelector) +
    ");" +
    "const label = row?.querySelector('.python-canvas-parameter-label');" +
    "const marker = row?.querySelector('[data-setta-workspace-item-diagnostic-marker=true]');" +
    "const markerRect = marker?.getBoundingClientRect();" +
    "const description = row?.querySelector('[data-setta-workspace-item-quick-info-description=true]');" +
    "const field = section?.querySelector('[data-workspace-section-field=true]');" +
    "const editor = section?.querySelector(" +
    JSON.stringify(fieldSelector) +
    ");" +
    "const indicator = field?.querySelector('[aria-hidden=true][title]');" +
    "const describedBy = editor?.getAttribute('aria-describedby')?.split(/\\s+/) ?? [];" +
    "const fieldDescription = describedBy.map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim();" +
    "const mutationError = document.querySelector('#python-canvas-mutation-error');" +
    "const visibleAlert = [...document.querySelectorAll('[role=alert]')].some((element) => {" +
    "const rect = element.getBoundingClientRect();" +
    "return (element.textContent ?? '').trim() !== '' && rect.width > 1 && rect.height > 1;" +
    "});" +
    "if (!(section instanceof HTMLElement) || !(row instanceof HTMLElement) || !(label instanceof HTMLElement)) return null;" +
    "const staticSection = section.cloneNode(true);" +
    "for (const accessible of staticSection.querySelectorAll('[data-setta-workspace-item-diagnostic-announcer=true], [data-setta-workspace-item-quick-info-description=true]')) accessible.remove();" +
    "const staticText = staticSection.textContent ?? '';" +
    "return {" +
    "description: description?.textContent ?? ''," +
    "fieldDescription," +
    "fieldDiagnostic: field?.getAttribute('data-diagnostic') ?? null," +
    "fieldIndicatorTitle: indicator?.getAttribute('title') ?? null," +
    "fieldInvalid: editor?.getAttribute('aria-invalid') ?? null," +
    "labelText: label.textContent ?? ''," +
    "labelTitle: label.getAttribute('title')," +
    "markerSeverity: marker?.getAttribute('data-setta-workspace-item-diagnostic-severity') ?? null," +
    "markerVisible: markerRect !== undefined && markerRect.width > 0 && markerRect.height > 0," +
    "metadataPresent: row.querySelector('.python-canvas-parameter-metadata') !== null," +
    "mutationError: (mutationError?.textContent ?? '').trim()," +
    "parameterSeverity: row.getAttribute('data-setta-workspace-item-diagnostic-severity')," +
    "staticMetadata: staticText.includes('Provider ordinal') || staticText.includes('Passing style') || staticText.includes('_SupportsFloat')," +
    "visibleAlert" +
    "};" +
    "})()"
  );
}
