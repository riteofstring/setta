import assert from "node:assert/strict";

import { fetchCanonicalSnapshot } from "./browser-processes.mjs";
import { waitForSnapshot } from "./callable-commit.browser.mjs";
import {
  activateCodeEditor,
  clickElementCenter,
  dragBetweenPoints,
  evaluate,
  focusElement,
  insertText,
  moveCaretToDocumentEnd,
  waitFor,
} from "./browser-page.mjs";
import { generatedPythonEditorSelector } from "./python-target.browser.mjs";

const generatedSectionSelector =
  '[data-section-id="python-canvas:generated-python"]';
const runSelector = `${generatedSectionSelector} [data-generated-python-run]`;
const terminalToggleSelector = `${generatedSectionSelector} [data-generated-python-terminal-toggle]`;
const terminalPaneSelector = `${generatedSectionSelector} .python-canvas-generated-python-terminal-pane`;
const terminalSurfaceSelector = `${terminalPaneSelector} [data-attached-terminal-section-id="generated-python-runtime"]`;
const terminalTextAreaSelector = `${terminalSurfaceSelector} .xterm-helper-textarea`;
const terminalRowsSelector = `${terminalSurfaceSelector} .xterm-rows`;
const terminalTrashSelector = `${terminalPaneSelector} [data-attached-terminal-trash]`;
const terminalSplitterSelector = `${terminalPaneSelector} [aria-label="Resize terminal height"]`;

const createOnlyMarker = "SETTA_TERMINAL_CREATE_DID_NOT_RUN";
const shellSessionMarker = "SETTA_TERMINAL_SHELL_SESSION";
const flushedRunMarker = "SETTA_TERMINAL_FLUSHED_RUN";
const staleOrderingMarker = "SETTA_TERMINAL_STALE_ORDERING";
const longRunStartedMarker = "SETTA_TERMINAL_LONG_RUN_STARTED";
const afterInterruptMarker = "SETTA_TERMINAL_AFTER_INTERRUPT";
const beforeTrashMarker = "SETTA_TERMINAL_BEFORE_TRASH";

export async function exerciseGeneratedPythonTerminalLifecycle(
  client,
  backendOrigin,
) {
  const targetWithCreateMarker = await appendPythonSuffix(
    client,
    backendOrigin,
    `\nprint(${JSON.stringify(createOnlyMarker)})`,
  );
  const editorBeforeCreate = await generatedTerminalGeometry(client);
  assert.equal(editorBeforeCreate.pane, null);

  await clickElementCenter(
    client,
    terminalToggleSelector,
    "the Generated Python Create terminal control",
  );
  await waitForTerminalReady(client);

  const afterCreate = await fetchCanonicalSnapshot(backendOrigin);
  assert.equal(
    afterCreate.project.revision,
    targetWithCreateMarker.project.revision,
    "Creating a terminal changed the authored project revision.",
  );
  assert.equal(
    afterCreate.diagnosticsRevision,
    targetWithCreateMarker.diagnosticsRevision,
    "Creating a terminal restarted diagnostics.",
  );
  assert.deepEqual(
    afterCreate.diagnostics,
    targetWithCreateMarker.diagnostics,
    "Creating a terminal changed the current diagnostics.",
  );
  assert.equal(
    await terminalMarkerCount(client, createOnlyMarker),
    0,
    "Create terminal executed Generated Python.",
  );

  const editorAfterCreate = await generatedTerminalGeometry(client);
  assert.ok(editorAfterCreate.pane, "The joined terminal pane is missing.");
  assertApproximately(
    editorAfterCreate.pane.height,
    220,
    2,
    "The attached terminal did not use main's 220 px default height.",
  );
  assertApproximately(
    editorAfterCreate.editor.height,
    editorBeforeCreate.editor.height,
    2,
    "Creating the terminal changed the code editor height.",
  );
  assertApproximately(
    editorAfterCreate.section.height - editorBeforeCreate.section.height,
    220,
    2,
    "The Generated Python card did not grow by the terminal height.",
  );
  assertPaneAligned(editorAfterCreate);

  await typeTerminalCommand(
    client,
    `printf '${octalShellText(shellSessionMarker)}\\n'`,
  );
  await waitForTerminalMarkerCount(client, shellSessionMarker, 1);

  const revisionBeforeHide = (await fetchCanonicalSnapshot(backendOrigin)).project
    .revision;
  await clickElementCenter(
    client,
    terminalToggleSelector,
    "the Generated Python Hide terminal control",
  );
  await waitForTerminalState(client, "Show terminal", false);
  await clickElementCenter(
    client,
    terminalToggleSelector,
    "the Generated Python Show terminal control",
  );
  await waitForTerminalReady(client);
  await waitForTerminalMarkerCount(client, shellSessionMarker, 1);
  assert.equal(
    (await fetchCanonicalSnapshot(backendOrigin)).project.revision,
    revisionBeforeHide,
    "Hiding or showing the terminal changed the authored project revision.",
  );

  await clickElementCenter(
    client,
    terminalToggleSelector,
    "the Generated Python Hide terminal control",
  );
  await waitForTerminalState(client, "Show terminal", false);
  const staleRevision = (await fetchCanonicalSnapshot(backendOrigin)).project
    .revision;
  await appendPythonSuffixWithoutWaiting(
    client,
    `\nprint(${JSON.stringify(flushedRunMarker)})`,
  );
  await clickElementCenter(
    client,
    runSelector,
    "the Generated Python Run this code block control",
  );
  const firstRunSnapshot = await waitForSnapshot(
    backendOrigin,
    "Run to flush the pending Generated Python target edit",
    (snapshot) =>
      snapshot.project.revision > staleRevision &&
      snapshot.pythonTarget.suffix.includes(flushedRunMarker),
  );
  await waitForTerminalState(client, "Show terminal", false);
  await clickElementCenter(
    client,
    terminalToggleSelector,
    "the hidden Generated Python terminal Show control",
  );
  await waitForTerminalReady(client);
  await waitForTerminalMarkerCount(client, createOnlyMarker, 1);
  await waitForTerminalMarkerCount(client, flushedRunMarker, 1);

  const staleResponse = await fetch(
    `${backendOrigin}/api/v2/project/terminal/run`,
    {
      body: JSON.stringify({
        columns: 80,
        expectedRevision: staleRevision,
        projectId: firstRunSnapshot.project.id,
        rows: 24,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
  );
  assert.equal(staleResponse.status, 409);
  const staleError = await staleResponse.json();
  assert.equal(staleError.error?.code, "revision_conflict");
  await typeTerminalCommand(
    client,
    `printf '${octalShellText(staleOrderingMarker)}\\n'`,
  );
  await waitForTerminalMarkerCount(client, staleOrderingMarker, 1);
  assert.equal(
    await terminalMarkerCount(client, flushedRunMarker),
    1,
    "The stale run request executed the current Generated Python.",
  );

  await clickElementCenter(
    client,
    runSelector,
    "the Generated Python second Run control",
  );
  await waitForTerminalMarkerCount(client, flushedRunMarker, 2);
  assert.equal(
    (await fetchCanonicalSnapshot(backendOrigin)).project.revision,
    firstRunSnapshot.project.revision,
    "Running Generated Python changed its project revision.",
  );
  assert.equal(
    await evaluate(
      client,
      `document.querySelectorAll(${JSON.stringify(terminalPaneSelector)}).length`,
    ),
    1,
    "A repeated run created another terminal pane.",
  );

  await typeTerminalCommand(
    client,
    `python3 -c "import time; print(bytes.fromhex('${hexShellText(longRunStartedMarker)}').decode(), flush=True); time.sleep(60)"`,
  );
  await waitForTerminalMarkerCount(client, longRunStartedMarker, 1);
  await pressTerminalControlC(client);
  await typeTerminalCommand(
    client,
    `printf '${octalShellText(afterInterruptMarker)}\\n'`,
  );
  await waitForTerminalMarkerCount(client, afterInterruptMarker, 1);

  await exerciseTerminalResize(client);

  await typeTerminalCommand(
    client,
    `printf '${octalShellText(beforeTrashMarker)}\\n'`,
  );
  await waitForTerminalMarkerCount(client, beforeTrashMarker, 1);
  const revisionBeforeTrash = (await fetchCanonicalSnapshot(backendOrigin))
    .project.revision;
  await clickElementCenter(
    client,
    terminalTrashSelector,
    "the attached terminal trash control",
  );
  await waitForTerminalState(client, "Create terminal", false);
  assert.equal(
    (await fetchCanonicalSnapshot(backendOrigin)).project.revision,
    revisionBeforeTrash,
    "Trashing the terminal changed the authored project revision.",
  );

  await clickElementCenter(
    client,
    terminalToggleSelector,
    "the Generated Python Create terminal control after trash",
  );
  await waitForTerminalReady(client);
  assert.equal(
    await terminalMarkerCount(client, beforeTrashMarker),
    0,
    "A newly created terminal replayed history from the trashed shell.",
  );
}

async function appendPythonSuffix(client, backendOrigin, text) {
  await appendPythonSuffixWithoutWaiting(client, text);
  return waitForSnapshot(
    backendOrigin,
    "the terminal lifecycle Generated Python suffix",
    (snapshot) =>
      snapshot.pythonTarget.suffix.includes(text.trim()) &&
      snapshot.diagnosticsRevision === snapshot.project.revision,
  );
}

async function appendPythonSuffixWithoutWaiting(client, text) {
  await activateCodeEditor(
    client,
    generatedPythonEditorSelector,
    "the Generated Python document for terminal execution",
  );
  await moveCaretToDocumentEnd(client);
  await insertText(client, text);
}

async function waitForTerminalReady(client) {
  await waitForTerminalState(client, "Hide terminal", true);
  await waitFor(
    client,
    "the attached terminal shell output",
    `(() => {
      const rows = document.querySelector(${JSON.stringify(terminalRowsSelector)});
      return rows instanceof HTMLElement && (rows.textContent ?? "").trim().length > 0;
    })()`,
  );
}

async function waitForTerminalState(client, label, paneVisible) {
  await waitFor(
    client,
    `the ${label} terminal state`,
    `(() => {
      const toggle = document.querySelector(${JSON.stringify(terminalToggleSelector)});
      const pane = document.querySelector(${JSON.stringify(terminalPaneSelector)});
      return toggle instanceof HTMLButtonElement &&
        toggle.getAttribute("aria-label") === ${JSON.stringify(label)} &&
        ${paneVisible ? "pane instanceof HTMLElement" : "pane === null"};
    })()`,
  );
}

async function typeTerminalCommand(client, command) {
  await focusElement(client, terminalTextAreaSelector, "the terminal input");
  await insertText(client, command);
  await pressTerminalEnter(client);
}

async function pressTerminalEnter(client) {
  const key = {
    code: "Enter",
    key: "Enter",
    nativeVirtualKeyCode: 13,
    windowsVirtualKeyCode: 13,
  };
  await client.send("Input.dispatchKeyEvent", { ...key, type: "rawKeyDown" });
  await client.send("Input.dispatchKeyEvent", { ...key, type: "keyUp" });
}

async function pressTerminalControlC(client) {
  await focusElement(client, terminalTextAreaSelector, "the terminal input");
  const key = {
    code: "KeyC",
    key: "c",
    modifiers: 2,
    nativeVirtualKeyCode: 67,
    windowsVirtualKeyCode: 67,
  };
  await client.send("Input.dispatchKeyEvent", { ...key, type: "rawKeyDown" });
  await client.send("Input.dispatchKeyEvent", { ...key, type: "keyUp" });
}

async function waitForTerminalMarkerCount(client, marker, count) {
  await waitFor(
    client,
    `${JSON.stringify(marker)} to appear ${String(count)} time(s) in the terminal`,
    `(() => {
      const rows = document.querySelector(${JSON.stringify(terminalRowsSelector)});
      if (!(rows instanceof HTMLElement)) {
        return false;
      }
      return (rows.textContent ?? "").split(${JSON.stringify(marker)}).length - 1 === ${String(count)};
    })()`,
  );
}

async function terminalMarkerCount(client, marker) {
  return evaluate(
    client,
    `(() => {
      const rows = document.querySelector(${JSON.stringify(terminalRowsSelector)});
      if (!(rows instanceof HTMLElement)) {
        return 0;
      }
      return (rows.textContent ?? "").split(${JSON.stringify(marker)}).length - 1;
    })()`,
  );
}

async function exerciseTerminalResize(client) {
  const before = await generatedTerminalGeometry(client);
  assert.ok(before.pane);
  const rowsBefore = await terminalRowCount(client);
  const splitter = await elementRect(
    client,
    terminalSplitterSelector,
    "the terminal height splitter",
  );
  await dragBetweenPoints(
    client,
    { x: splitter.x + splitter.width / 2, y: splitter.y + splitter.height / 2 },
    {
      x: splitter.x + splitter.width / 2,
      y: splitter.y + splitter.height / 2 + 60,
    },
  );
  await waitFor(
    client,
    "the attached terminal height resize",
    `document.querySelector(${JSON.stringify(terminalPaneSelector)})?.getBoundingClientRect().height >= ${String(before.pane.height + 50)}`,
  );
  const afterHeight = await generatedTerminalGeometry(client);
  assert.ok(afterHeight.pane);
  assertApproximately(
    afterHeight.editor.height,
    before.editor.height,
    2,
    "Resizing the terminal changed the code editor height.",
  );
  assertApproximately(
    afterHeight.section.height - before.section.height,
    afterHeight.pane.height - before.pane.height,
    2,
    "The owning card did not follow the terminal height delta.",
  );
  await waitFor(
    client,
    "xterm to fit additional rows after the terminal height resize",
    `document.querySelector(${JSON.stringify(terminalRowsSelector)})?.children.length > ${String(rowsBefore)}`,
  );

  const rightHandle = await elementRect(
    client,
    `${generatedSectionSelector} .section-resize-handle-right`,
    "the Generated Python width resize handle",
  );
  await dragBetweenPoints(
    client,
    {
      x: rightHandle.x + rightHandle.width / 2,
      y: rightHandle.y + rightHandle.height / 2,
    },
    {
      x: rightHandle.x + rightHandle.width / 2 + 80,
      y: rightHandle.y + rightHandle.height / 2,
    },
  );
  await waitFor(
    client,
    "the Generated Python owner width resize",
    `document.querySelector(${JSON.stringify(generatedSectionSelector)})?.getBoundingClientRect().width >= ${String(before.section.width + 60)}`,
  );
  const afterWidth = await generatedTerminalGeometry(client);
  assert.ok(afterWidth.pane);
  assert.ok(
    afterWidth.pane.width > before.pane.width + 60,
    "The terminal did not follow its owning code section's width.",
  );
  assertPaneAligned(afterWidth);
}

async function terminalRowCount(client) {
  return evaluate(
    client,
    `document.querySelector(${JSON.stringify(terminalRowsSelector)})?.children.length ?? 0`,
  );
}

async function generatedTerminalGeometry(client) {
  const geometry = await evaluate(
    client,
    `(() => {
      const section = document.querySelector(${JSON.stringify(generatedSectionSelector)});
      const editor = document.querySelector(${JSON.stringify(`${generatedSectionSelector} .python-canvas-generated-python-editor`)});
      const pane = document.querySelector(${JSON.stringify(terminalPaneSelector)});
      if (!(section instanceof HTMLElement) || !(editor instanceof HTMLElement)) {
        return null;
      }
      const box = (element) => {
        const rect = element.getBoundingClientRect();
        return { bottom: rect.bottom, height: rect.height, left: rect.left, right: rect.right, top: rect.top, width: rect.width };
      };
      return {
        editor: box(editor),
        pane: pane instanceof HTMLElement ? box(pane) : null,
        section: box(section),
      };
    })()`,
  );
  assert.ok(geometry, "Generated Python did not expose measurable geometry.");
  return geometry;
}

async function elementRect(client, selector, description) {
  const rect = await evaluate(
    client,
    `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!(element instanceof HTMLElement)) {
        return null;
      }
      const rect = element.getBoundingClientRect();
      return { height: rect.height, width: rect.width, x: rect.x, y: rect.y };
    })()`,
  );
  assert.ok(rect, `${description} is missing.`);
  assert.ok(rect.width > 0 && rect.height > 0, `${description} is not visible.`);
  return rect;
}

function assertPaneAligned(geometry) {
  assert.ok(geometry.pane);
  assertApproximately(
    geometry.pane.left,
    geometry.editor.left,
    2,
    "The terminal's left edge did not follow the editor.",
  );
  assertApproximately(
    geometry.pane.right,
    geometry.editor.right,
    2,
    "The terminal's right edge did not follow the editor.",
  );
}

function assertApproximately(actual, expected, tolerance, message) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message} Expected ${String(expected)} ± ${String(tolerance)}, received ${String(actual)}.`,
  );
}

function octalShellText(value) {
  return [...value]
    .map((character) => `\\${character.charCodeAt(0).toString(8).padStart(3, "0")}`)
    .join("");
}

function hexShellText(value) {
  return [...value]
    .map((character) => character.charCodeAt(0).toString(16).padStart(2, "0"))
    .join("");
}
