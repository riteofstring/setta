import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

import {
  fetchCanonicalSnapshot,
  productionTimeoutMs,
} from "./browser-processes.mjs";
import {
  activateContentEditableTextBox,
  contentEditableTextBoxSelector,
  evaluate,
  insertText,
  labeledSelector,
  navigate,
  pressAlternateEnter,
  pressEnter,
  selectAll,
  waitFor,
} from "./browser-page.mjs";

const generatedPythonEditorSelector = labeledSelector(
  "Generated Python code editor, generated output read-only",
);

export async function openWorkspaceCanvas(client, previewOrigin) {
  await navigate(client, previewOrigin);
  await waitFor(
    client,
    "the edge-to-edge workspace canvas without app chrome",
    `(() => {
      const canvas = document.querySelector('[role="region"][aria-label="Workspace canvas"]');
      const pane = document.querySelector('.react-flow__pane[aria-label="Workspace canvas background"]');
      return canvas instanceof HTMLElement && pane instanceof HTMLElement &&
        document.querySelector('.python-canvas-heading') === null &&
        document.querySelector('.python-canvas-project-controls') === null &&
        document.querySelector('.python-canvas-empty-state') === null;
    })()`,
  );
}

export async function commitCallableExpressionAndRefresh(
  client,
  backendOrigin,
  name,
  expression,
  harness,
) {
  const before = await fetchCanonicalSnapshot(backendOrigin);
  await activateContentEditableTextBox(
    client,
    `${harness.callableSectionSelector(name)} ${contentEditableTextBoxSelector("Callable expression")}`,
    `the ${name} callable expression`,
  );
  await selectAll(client);
  await insertText(client, expression);
  await pressAlternateEnter(client);
  await waitForSnapshot(
    backendOrigin,
    `the ${name} callable expression commit`,
    (snapshot) =>
      harness.findCallable(snapshot, name)?.authoredExpression === expression &&
      snapshot.project.revision >= before.project.revision + 2,
  );
  await waitForCallableUiIdle(client, name, harness);
}

export async function exerciseCallableCommitParity(
  client,
  backendOrigin,
  name,
  expectedGeneratedPath,
  harness,
) {
  await exerciseCallableCompletionApply(client, backendOrigin, name, harness);
  await exerciseUnresolvedCallableCommit(
    client,
    backendOrigin,
    name,
    expectedGeneratedPath,
    harness,
  );
}

async function exerciseCallableCompletionApply(
  client,
  backendOrigin,
  name,
  harness,
) {
  const initial = harness.findRequiredCallable(
    await fetchCanonicalSnapshot(backendOrigin),
    name,
  );
  const sectionSelector = harness.callableSectionSelector(name);
  const editorSelector = contentEditableTextBoxSelector("Callable expression");
  const expressionSelector = `${sectionSelector} ${editorSelector}`;
  await activateContentEditableTextBox(
    client,
    expressionSelector,
    `the ${name} callable expression`,
  );
  await selectAll(client);
  await insertText(client, "fixture_module.sam");
  await waitFor(
    client,
    "the selected callable completion",
    `(() => {
      const popup = document.querySelector('.cm-tooltip-autocomplete');
      const selected = popup?.querySelector('[role="option"][aria-selected="true"]');
      return popup instanceof HTMLElement && selected?.textContent?.includes("sample") === true;
    })()`,
  );
  const requestsBefore = await callableCommitRequestCount(client);
  await pressEnter(client);
  await waitFor(
    client,
    "main's completed draft and apply hint after the first Enter",
    `(() => {
      const section = document.querySelector(${JSON.stringify(sectionSelector)});
      const field = section?.querySelector('[data-workspace-section-field="true"]');
      const editor = section?.querySelector(${JSON.stringify(editorSelector)});
      const indicator = field?.querySelector('.setta-workspace-section-field-apply-indicator');
      return field?.getAttribute('data-uncommitted') === 'true' &&
        field?.getAttribute('data-diagnostic') === 'false' &&
        editor?.textContent === 'fixture_module.sample' &&
        editor === document.activeElement &&
        indicator?.getAttribute('role') === 'status' &&
        indicator?.getAttribute('aria-label') === 'Callable expression changed. Press Enter to apply' &&
        indicator?.getAttribute('title') === 'Press Enter to apply' &&
        indicator?.querySelector('.gg-corner-right-down') instanceof HTMLElement &&
        document.querySelector('.cm-tooltip-autocomplete') === null;
    })()`,
  );
  assert.equal(
    harness.findRequiredCallable(
      await fetchCanonicalSnapshot(backendOrigin),
      name,
    ).authoredExpression,
    initial.authoredExpression,
    "The completion-accepting Enter persisted the callable.",
  );
  assert.equal(
    await callableCommitRequestCount(client),
    requestsBefore,
    "The completion-accepting Enter sent a callable commit.",
  );

  await pressEnter(client);
  await waitForSnapshot(
    backendOrigin,
    "the completed callable applied by the second Enter",
    (snapshot) =>
      harness.findCallable(snapshot, name)?.authoredExpression ===
      "fixture_module.sample",
  );
  await waitFor(
    client,
    "the cleared callable apply hint",
    `(() => {
      const section = document.querySelector(${JSON.stringify(sectionSelector)});
      const field = section?.querySelector('[data-workspace-section-field="true"]');
      return field?.getAttribute('data-uncommitted') === 'false' &&
        field?.querySelector('.setta-workspace-section-field-apply-indicator') === null;
    })()`,
  );
  assert.equal(
    await callableCommitRequestCount(client),
    requestsBefore + 1,
    "The second Enter did not send exactly one callable commit.",
  );
}

async function exerciseUnresolvedCallableCommit(
  client,
  backendOrigin,
  name,
  expectedGeneratedPath,
  harness,
) {
  const created = harness.findRequiredCallable(
    await fetchCanonicalSnapshot(backendOrigin),
    name,
  );
  const sectionSelector = harness.callableSectionSelector(name);
  const expressionSelector = `${sectionSelector} ${contentEditableTextBoxSelector("Callable expression")}`;
  const refreshRequestsBefore =
    await callableParameterRefreshRequestCount(client);

  await gateNextCallableCommitResponse(client);
  await activateContentEditableTextBox(
    client,
    expressionSelector,
    "the unresolved callable expression",
  );
  await selectAll(client);
  await insertText(client, "math.sqrt");
  await pressEnter(client);

  const unresolved = await waitForSnapshot(
    backendOrigin,
    "the unresolved callable expression and Basedpyright diagnostic",
    (snapshot) => {
      const callable = harness.findCallable(snapshot, name);
      return (
        callable?.authoredExpression === "math.sqrt" &&
        snapshot.diagnostics.some(
          (diagnostic) =>
            diagnostic.targetId === created.id &&
            /not defined|unknown/i.test(diagnostic.message),
        )
      );
    },
  );
  const diagnostic = unresolved.diagnostics.find(
    (candidate) =>
      candidate.targetId === created.id &&
      /not defined|unknown/i.test(candidate.message),
  );
  assert.ok(diagnostic, "Basedpyright did not target the unresolved callable.");
  assert.ok(
    unresolved.generatedCode.body
      .split("\n")
      .some(
        (line) =>
          line.trim() === `state.${expectedGeneratedPath} = math.sqrt()`,
      ),
    `Generated Python leaked an internal callable identifier instead of state.${expectedGeneratedPath}:\n${unresolved.generatedCode.body}`,
  );

  await waitFor(
    client,
    "main-style callable pending presentation without a section lock",
    `(() => {
      const section = document.querySelector(${JSON.stringify(sectionSelector)});
      const field = section?.querySelector('[data-workspace-section-field="true"]');
      const editor = section?.querySelector(${JSON.stringify(contentEditableTextBoxSelector("Callable expression"))});
      const overlay = section?.querySelector('[data-python-canvas-parameter-pending="true"]');
      const lock = section?.querySelector('button[aria-label="Lock position and size"]');
      const unlock = section?.querySelector('button[aria-label="Unlock position and size"]');
      const mutationError = document.querySelector('#python-canvas-mutation-error');
      const gate = window.__pythonCanvasCallableCommitGate;
      return gate?.intercepted === true && section instanceof HTMLElement &&
        field instanceof HTMLElement && field.dataset.disabled === "false" &&
        editor instanceof HTMLElement && editor.getAttribute("contenteditable") === "true" &&
        editor.getAttribute("aria-disabled") !== "true" &&
        overlay instanceof HTMLElement && lock instanceof HTMLElement && unlock === null &&
        (mutationError?.textContent ?? "").trim() === "";
    })()`,
  );

  await releaseCallableCommitResponse(client);
  try {
    await waitFor(
      client,
      "the unresolved callable field error state",
      `(() => {
        const state = ${unresolvedCallableUiStateExpression(sectionSelector)};
        return state.fieldDiagnostic === "true" && state.fieldDisabled === "false" &&
          state.editorInvalid === "true" && state.indicatorTitle?.includes(${JSON.stringify(diagnostic.message)}) === true &&
          state.diagnosticDescription.includes(${JSON.stringify(diagnostic.message)}) &&
          state.overlayPresent === false && state.mutationError === "" && state.visibleAlert === false;
      })()`,
    );
  } catch (error) {
    const state = await evaluate(
      client,
      unresolvedCallableUiStateExpression(sectionSelector),
    );
    throw new Error(
      `${error instanceof Error ? error.message : String(error)} Final UI state: ${JSON.stringify(state)}.`,
      { cause: error },
    );
  }
  assert.equal(
    await callableParameterRefreshRequestCount(client),
    refreshRequestsBefore,
    "Normal Enter unexpectedly refreshed callable parameters.",
  );
  await assertGeneratedBodyPresentation(client, unresolved);
}

export async function waitForCallableUiIdle(client, name, harness) {
  await waitFor(
    client,
    `the completed ${name} presentation`,
    `(() => {
      const section = document.querySelector(${JSON.stringify(harness.callableSectionSelector(name))});
      const field = section?.querySelector('[data-workspace-section-field="true"]');
      const editor = section?.querySelector(${JSON.stringify(contentEditableTextBoxSelector("Callable expression"))});
      const overlay = section?.querySelector('[data-python-canvas-parameter-pending="true"]');
      return section instanceof HTMLElement && section.getAttribute("aria-busy") !== "true" &&
        field instanceof HTMLElement && field.dataset.disabled === "false" &&
        editor instanceof HTMLElement && editor.getAttribute("aria-disabled") !== "true" &&
        overlay === null;
    })()`,
  );
}

export async function waitForSnapshot(backendOrigin, description, predicate) {
  const deadline = Date.now() + productionTimeoutMs;
  let latest = null;
  while (Date.now() < deadline) {
    latest = await fetchCanonicalSnapshot(backendOrigin);
    if (predicate(latest)) {
      return latest;
    }
    await delay(100);
  }
  throw new Error(
    `${description} did not reach the canonical V2 project: ${JSON.stringify(latest)}.`,
  );
}

function unresolvedCallableUiStateExpression(sectionSelector) {
  return `(() => {
    const section = document.querySelector(${JSON.stringify(sectionSelector)});
    const field = section?.querySelector('[data-workspace-section-field="true"]');
    const editor = section?.querySelector(${JSON.stringify(contentEditableTextBoxSelector("Callable expression"))});
    const indicator = field?.querySelector('[aria-hidden="true"][title]');
    const describedBy = editor?.getAttribute("aria-describedby")?.split(/\\s+/) ?? [];
    const diagnosticDescription = describedBy
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" ")
      .trim();
    const overlay = section?.querySelector('[data-python-canvas-parameter-pending="true"]');
    const mutationError = document.querySelector('#python-canvas-mutation-error');
    const visibleAlert = [...document.querySelectorAll('[role="alert"]')].some((element) => {
      const rect = element.getBoundingClientRect();
      return (element.textContent ?? "").trim() !== "" && rect.width > 1 && rect.height > 1;
    });
    return {
      editorInvalid: editor?.getAttribute("aria-invalid") ?? null,
      diagnosticDescription,
      fieldDiagnostic: field?.getAttribute("data-diagnostic") ?? null,
      fieldDisabled: field?.getAttribute("data-disabled") ?? null,
      indicatorTitle: indicator?.getAttribute("title") ?? null,
      mutationError: (mutationError?.textContent ?? "").trim(),
      overlayPresent: overlay instanceof HTMLElement,
      visibleAlert,
    };
  })()`;
}

async function gateNextCallableCommitResponse(client) {
  const installed = await evaluate(
    client,
    `(() => {
      if (window.__pythonCanvasCallableCommitGate !== undefined) {
        return false;
      }
      const originalFetch = window.fetch;
      let release;
      const wait = new Promise((resolve) => { release = resolve; });
      const gate = {
        intercepted: false,
        release: () => release(true),
      };
      window.__pythonCanvasCallableCommitGate = gate;
      window.fetch = async (...args) => {
        const input = args[0];
        const requestUrl = typeof input === "string" || input instanceof URL ? String(input) : input.url;
        const method = (args[1]?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
        const response = await originalFetch.apply(window, args);
        if (!gate.intercepted && method === "POST" && new URL(requestUrl, location.href).pathname.endsWith("/commit")) {
          gate.intercepted = true;
          await wait;
          window.fetch = originalFetch;
        }
        return response;
      };
      return true;
    })()`,
  );
  assert.equal(
    installed,
    true,
    "The callable commit response gate was not installed.",
  );
}

async function releaseCallableCommitResponse(client) {
  const released = await evaluate(
    client,
    `(() => {
      const gate = window.__pythonCanvasCallableCommitGate;
      if (gate?.intercepted !== true) {
        return false;
      }
      gate.release();
      delete window.__pythonCanvasCallableCommitGate;
      return true;
    })()`,
  );
  assert.equal(released, true, "The callable commit response was not gated.");
}

async function callableParameterRefreshRequestCount(client) {
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

async function callableCommitRequestCount(client) {
  return evaluate(
    client,
    `performance.getEntriesByType("resource").filter((entry) => {
      try {
        return new URL(entry.name).pathname.endsWith("/commit");
      } catch {
        return false;
      }
    }).length`,
  );
}

async function assertGeneratedBodyPresentation(client, snapshot) {
  const expectedBodyLines = snapshot.generatedCode.body.split("\n");
  const firstBodyLine = snapshot.pythonTarget.prefix.split("\n").length + 1;
  await waitFor(
    client,
    "every generated Python body line inside the protected block",
    `(() => {
      const editor = document.querySelector(${JSON.stringify(generatedPythonEditorSelector)});
      const lines = Array.from(editor?.querySelectorAll('.cm-line') ?? []);
      const body = lines.slice(${String(firstBodyLine)}, ${String(firstBodyLine + expectedBodyLines.length)});
      return body.length === ${String(expectedBodyLines.length)} &&
        JSON.stringify(body.map((line) => line.textContent ?? "")) === ${JSON.stringify(JSON.stringify(expectedBodyLines))} &&
        body.every((line) => line.getAttribute('data-workspace-generated-line') === 'middle');
    })()`,
  );
  const presentation = await evaluate(
    client,
    `(() => {
      const editor = document.querySelector(${JSON.stringify(generatedPythonEditorSelector)});
      const lines = Array.from(editor?.querySelectorAll('.cm-line') ?? []);
      const body = lines.slice(${String(firstBodyLine)}, ${String(firstBodyLine + expectedBodyLines.length)});
      return {
        body: body.map((line) => ({
          background: getComputedStyle(line, '::before').backgroundImage,
          mark: line.getAttribute('data-workspace-generated-line'),
          text: line.textContent ?? "",
        })),
        endBoundary: lines[${String(firstBodyLine + expectedBodyLines.length)}]?.getAttribute('data-workspace-generated-line') ?? null,
        startBoundary: lines[${String(firstBodyLine - 1)}]?.getAttribute('data-workspace-generated-line') ?? null,
      };
    })()`,
  );
  assert.deepEqual(
    presentation.body.map((line) => line.text),
    expectedBodyLines,
    "The generated Python block did not contain the canonical body lines.",
  );
  assert.ok(
    presentation.body.every(
      (line) =>
        line.mark === "middle" && line.background.includes("linear-gradient"),
    ),
    `Generated Python body lines escaped the visible protected surface: ${JSON.stringify(presentation)}.`,
  );
  assert.equal(presentation.startBoundary, "start");
  assert.equal(presentation.endBoundary, "end");
}
