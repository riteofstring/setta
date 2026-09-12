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
  visibleElementPoint,
  waitFor,
} from "./browser-page.mjs";
import { generatedPythonEditorSelector } from "./python-target.browser.mjs";

const generatedSectionSelector =
  '[data-section-id="python-canvas:generated-python"]';
const generatedGroupSelector =
  '[data-workspace-joined-section-group]:has(> [data-section-id="python-canvas:generated-python"])';
const runSelector = `${generatedSectionSelector} [data-generated-python-run]`;
const terminalToggleSelector = `${generatedSectionSelector} [data-generated-python-terminal-toggle]`;
const terminalPaneSelector = `${generatedGroupSelector} .python-canvas-generated-python-terminal-pane`;
const terminalSurfaceSelector = `${terminalPaneSelector} [data-attached-terminal-section-id="generated-python-runtime"]`;
const terminalTextAreaSelector = `${terminalSurfaceSelector} .xterm-helper-textarea`;
const terminalRowsSelector = `${terminalSurfaceSelector} .xterm-rows`;
const terminalScreenSelector = `${terminalSurfaceSelector} .xterm-screen`;
const terminalViewportSelector = `${terminalSurfaceSelector} .xterm-viewport`;
const terminalTrashSelector = `${terminalPaneSelector} [data-attached-terminal-trash]`;
const terminalSplitterSelector = `${terminalPaneSelector} [aria-label="Resize terminal height"]`;
const canvasPaneSelector = ".react-flow__pane";

const createOnlyMarker = "SETTA_TERMINAL_CREATE_DID_NOT_RUN";
const shellSessionMarker = "SETTA_TERMINAL_SHELL_SESSION";
const flushedRunMarker = "SETTA_TERMINAL_FLUSHED_RUN";
const staleOrderingMarker = "SETTA_TERMINAL_STALE_ORDERING";
const longRunStartedMarker = "SETTA_TERMINAL_LONG_RUN_STARTED";
const afterInterruptMarker = "SETTA_TERMINAL_AFTER_INTERRUPT";
const beforeTrashMarker = "SETTA_TERMINAL_BEFORE_TRASH";
const absentRunMarker = "SETTA_TERMINAL_ABSENT_RUN";
const copiedParamDictListRunMarker =
  "SETTA_TERMINAL_COPIED_PARAM_DICT_LIST_RUN";

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
    editorAfterCreate.section.height,
    editorBeforeCreate.section.height,
    2,
    "Creating the terminal changed the authored Generated Python height.",
  );
  assertApproximately(
    editorAfterCreate.group.height - editorBeforeCreate.group.height,
    editorAfterCreate.pane.height,
    2,
    "The joined Generated Python group did not grow by the terminal height.",
  );
  assertPaneAligned(editorAfterCreate);
  assert.equal(
    await terminalOwnsWheel(client),
    false,
    "A terminal without scrollback took wheel ownership from the canvas.",
  );

  await typeTerminalCommand(
    client,
    `printf '${octalShellText(shellSessionMarker)}\\n'`,
  );
  await waitForTerminalMarkerCount(client, shellSessionMarker, 1);

  const revisionBeforeHide = (await fetchCanonicalSnapshot(backendOrigin))
    .project.revision;
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

  await clickElementCenter(
    client,
    terminalTrashSelector,
    "the fresh attached terminal trash control",
  );
  await waitForTerminalState(client, "Create terminal", false);
  await appendPythonSuffixWithoutWaiting(
    client,
    `\nprint(${JSON.stringify(absentRunMarker)})`,
  );
  await clickElementCenter(
    client,
    runSelector,
    "the Generated Python Run control without an existing terminal",
  );
  await waitForTerminalReady(client);
  await waitForTerminalMarkerCount(client, absentRunMarker, 1);
  await assertManagedRunTranscript(client);
}

export async function runGeneratedPythonAndWaitForMarker(client, marker) {
  await clickElementCenter(
    client,
    runSelector,
    "the Generated Python Run this code block control",
  );
  await waitForTerminalReady(client);
  await waitForTerminalMarkerCount(client, marker, 1);
}

export async function exerciseCopiedParamDictListTerminalRun(client) {
  await clickElementCenter(
    client,
    runSelector,
    "the copied Param Dict and List Generated Python Run control",
  );
  await waitForTerminalReady(client);
  await typeTerminalCommand(
    client,
    `printf '${octalShellText(copiedParamDictListRunMarker)}\\n'`,
  );
  await waitForTerminalMarkerCount(client, copiedParamDictListRunMarker, 1);
  await exerciseTerminalPresentationAndScrollOwnership(client);
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

async function assertManagedRunTranscript(client) {
  const visibleRows = await evaluate(
    client,
    `(() => {
      const rows = document.querySelector(${JSON.stringify(terminalRowsSelector)});
      return rows instanceof HTMLElement ? rows.textContent ?? "" : null;
    })()`,
  );
  assert.equal(
    typeof visibleRows,
    "string",
    "The terminal rows are missing after the generated Python Run.",
  );
  assert.ok(
    visibleRows.includes(".setta-run-"),
    `The terminal transcript did not show the relative run artifact: ${JSON.stringify(visibleRows)}.`,
  );
  for (const implementationDetail of [
    "__setta_status",
    "rm -f",
    "del /f /q",
    ".setta-python-canvas-run-",
  ]) {
    assert.ok(
      !visibleRows.includes(implementationDetail),
      `The terminal transcript exposed ${JSON.stringify(implementationDetail)}: ${JSON.stringify(visibleRows)}.`,
    );
  }
}

async function exerciseTerminalPresentationAndScrollOwnership(client) {
  const scrollbackMarker = "SETTA_TERMINAL_SCROLLBACK";
  await typeTerminalCommand(
    client,
    `python3 -c "for i in range(96): print('${scrollbackMarker}-%03d' % i)"`,
  );
  await waitForTerminalMarkerCount(client, `${scrollbackMarker}-095`, 1);
  await waitFor(
    client,
    "terminal scrollback wheel ownership",
    `(() => {
      const surface = document.querySelector(${JSON.stringify(terminalSurfaceSelector)});
      return surface instanceof HTMLElement &&
        surface.classList.contains("nowheel");
    })()`,
  );
  assertTerminalPresentation(await terminalPresentation(client));

  const beforeScroll = await terminalScrollState(client);
  assert.ok(
    beforeScroll.visibleRows.includes(`${scrollbackMarker}-095`),
    `Terminal did not render its live output before scrolling: ${JSON.stringify(beforeScroll)}.`,
  );
  const blankCanvasPoint = await visibleElementPoint(
    client,
    canvasPaneSelector,
    "a blank workspace canvas point",
    { exactElementHit: true },
  );
  const terminalScreen = await elementRect(
    client,
    terminalScreenSelector,
    "the xterm screen before a canvas pan-scroll",
  );
  await dispatchPhysicalWheel(client, blankCanvasPoint, {
    deltaX: 20,
    deltaY: 0,
  });
  await dispatchPhysicalWheel(
    client,
    {
      x: terminalScreen.x + terminalScreen.width / 2,
      y: terminalScreen.y + terminalScreen.height / 2,
    },
    { deltaX: 0, deltaY: -120 },
  );
  await waitForCanvasOffset(
    client,
    "the blank-canvas and terminal-crossing pan-scroll gesture to move both canvas axes",
    beforeScroll.canvasOffset,
    { x: true, y: true },
  );
  const afterPanScrollGesture = await terminalScrollState(client);
  assert.notEqual(
    afterPanScrollGesture.canvasOffset.x,
    beforeScroll.canvasOffset.x,
    "The blank-canvas wheel gesture did not move the canvas horizontally.",
  );
  assert.notEqual(
    afterPanScrollGesture.canvasOffset.y,
    beforeScroll.canvasOffset.y,
    "The active canvas pan-scroll gesture stopped when it crossed the terminal.",
  );
  assert.equal(
    afterPanScrollGesture.visibleRows,
    beforeScroll.visibleRows,
    "The active canvas pan-scroll gesture scrolled xterm while crossing the terminal.",
  );

  await waitFor(
    client,
    "the canvas pan-scroll gesture to release wheel ownership",
    `(() => {
      const canvas = document.querySelector(".setta-workspace.react-flow");
      return canvas instanceof HTMLElement &&
        !canvas.hasAttribute("data-viewport-interaction-active");
    })()`,
  );
  const beforeTerminalOwnedWheel = await terminalScrollState(client);
  await dispatchTerminalWheelBurst(client, -120);
  await waitFor(
    client,
    "the terminal to scroll upward after the canvas pan-scroll timeout",
    `(() => {
      const rows = document.querySelector(${JSON.stringify(terminalRowsSelector)});
      const text = rows instanceof HTMLElement ? rows.textContent ?? "" : "";
      return text.includes(${JSON.stringify(scrollbackMarker)}) &&
        !text.includes(${JSON.stringify(`${scrollbackMarker}-095`)}) &&
        text !== ${JSON.stringify(beforeTerminalOwnedWheel.visibleRows)};
    })()`,
  );
  const afterScrollUp = await terminalScrollState(client);
  assert.ok(
    afterScrollUp.visibleRows.includes(scrollbackMarker) &&
      !afterScrollUp.visibleRows.includes(`${scrollbackMarker}-095`) &&
      afterScrollUp.visibleRows !== beforeTerminalOwnedWheel.visibleRows,
    "The terminal did not regain wheel ownership after the canvas pan-scroll timeout.",
  );
  assertApproximately(
    afterScrollUp.pane.left,
    beforeTerminalOwnedWheel.pane.left,
    0.5,
    "Terminal scrollback panned the canvas horizontally.",
  );
  assertApproximately(
    afterScrollUp.pane.top,
    beforeTerminalOwnedWheel.pane.top,
    0.5,
    "Terminal scrollback panned the canvas vertically.",
  );
  assert.equal(
    afterScrollUp.canvasTransform,
    beforeTerminalOwnedWheel.canvasTransform,
    "Terminal scrollback changed the canvas transform.",
  );
}

function assertTerminalPresentation(presentation) {
  assert.equal(
    presentation.paddingBlockStart,
    "0px",
    "The attached terminal retained a top inset instead of filling its surface.",
  );
  assert.equal(
    presentation.paddingBlockEnd,
    "0px",
    "The attached terminal retained a bottom inset instead of filling its surface.",
  );
  assert.equal(
    presentation.paddingInlineStart,
    "0px",
    "The attached terminal retained a horizontal inset instead of filling its surface.",
  );
  assert.equal(
    presentation.paddingInlineEnd,
    "0px",
    "The attached terminal retained a horizontal inset instead of filling its surface.",
  );
  assert.equal(
    presentation.scrollbarWidth,
    "thin",
    "The xterm viewport did not use main's thin scrollbar presentation.",
  );
  assert.match(
    presentation.scrollbarColor,
    /148, 163, 184/,
    "The xterm viewport did not use main's muted scrollbar color.",
  );
  assert.ok(
    presentation.trash.inlineSize === "16px" &&
      presentation.trash.blockSize === "16px" &&
      presentation.trash.width > 0 &&
      presentation.trash.height > 0,
    "The terminal trash control lost its existing visible 16 px hit target.",
  );
  assert.ok(
    presentation.trash.left >= presentation.pane.left &&
      presentation.trash.right <= presentation.pane.right &&
      presentation.trash.top >= presentation.pane.top &&
      presentation.trash.bottom <= presentation.pane.bottom,
    `The terminal trash control is clipped outside its pane: ${JSON.stringify(presentation)}.`,
  );
}

async function terminalOwnsWheel(client) {
  return evaluate(
    client,
    `document.querySelector(${JSON.stringify(terminalSurfaceSelector)})?.classList.contains("nowheel") ?? false`,
  );
}

async function terminalPresentation(client) {
  const presentation = await evaluate(
    client,
    `(() => {
      const surface = document.querySelector(${JSON.stringify(terminalSurfaceSelector)});
      const viewport = document.querySelector(${JSON.stringify(terminalViewportSelector)});
      const pane = document.querySelector(${JSON.stringify(terminalPaneSelector)});
      const trash = document.querySelector(${JSON.stringify(terminalTrashSelector)});
      if (!(surface instanceof HTMLElement) ||
        !(viewport instanceof HTMLElement) ||
        !(pane instanceof HTMLElement) ||
        !(trash instanceof HTMLElement)) {
        return null;
      }
      const surfaceStyle = getComputedStyle(surface);
      const viewportStyle = getComputedStyle(viewport);
      const trashStyle = getComputedStyle(trash);
      const paneRect = pane.getBoundingClientRect();
      const trashRect = trash.getBoundingClientRect();
      return {
        paddingBlockEnd: surfaceStyle.paddingBlockEnd,
        paddingBlockStart: surfaceStyle.paddingBlockStart,
        paddingInlineEnd: surfaceStyle.paddingInlineEnd,
        paddingInlineStart: surfaceStyle.paddingInlineStart,
        scrollbarColor: viewportStyle.scrollbarColor,
        scrollbarWidth: viewportStyle.scrollbarWidth,
        pane: {
          bottom: paneRect.bottom,
          left: paneRect.left,
          right: paneRect.right,
          top: paneRect.top,
        },
        trash: {
          blockSize: trashStyle.blockSize,
          bottom: trashRect.bottom,
          height: trashRect.height,
          inlineSize: trashStyle.inlineSize,
          left: trashRect.left,
          right: trashRect.right,
          top: trashRect.top,
          width: trashRect.width,
        },
      };
    })()`,
  );
  assert.ok(presentation, "The xterm scrollbar presentation is missing.");
  return presentation;
}

async function terminalScrollState(client) {
  const state = await evaluate(
    client,
    `(() => {
      const pane = document.querySelector(${JSON.stringify(terminalPaneSelector)});
      const rows = document.querySelector(${JSON.stringify(terminalRowsSelector)});
      const canvasViewport = document.querySelector(".react-flow__viewport");
      if (!(pane instanceof HTMLElement) ||
        !(rows instanceof HTMLElement) ||
        !(canvasViewport instanceof HTMLElement)) {
        return null;
      }
      const paneRect = pane.getBoundingClientRect();
      const canvasMatrix = new DOMMatrixReadOnly(
        getComputedStyle(canvasViewport).transform,
      );
      return {
        canvasOffset: { x: canvasMatrix.m41, y: canvasMatrix.m42 },
        canvasTransform: getComputedStyle(canvasViewport).transform,
        pane: { left: paneRect.left, top: paneRect.top },
        visibleRows: rows.textContent ?? "",
      };
    })()`,
  );
  assert.ok(state, "The xterm viewport is missing.");
  return state;
}

async function waitForCanvasOffset(client, description, before, changed) {
  await waitFor(
    client,
    description,
    `(() => {
      const canvasViewport = document.querySelector(".react-flow__viewport");
      if (!(canvasViewport instanceof HTMLElement)) {
        return false;
      }
      const matrix = new DOMMatrixReadOnly(getComputedStyle(canvasViewport).transform);
      const xChanged = Math.abs(matrix.m41 - ${String(before.x)}) > 0.5;
      const yChanged = Math.abs(matrix.m42 - ${String(before.y)}) > 0.5;
      return xChanged === ${String(changed.x)} && yChanged === ${String(changed.y)};
    })()`,
  );
}

async function dispatchPhysicalWheel(client, point, { deltaX, deltaY }) {
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: point.x,
    y: point.y,
  });
  await client.send("Input.dispatchMouseEvent", {
    deltaX,
    deltaY,
    type: "mouseWheel",
    x: point.x,
    y: point.y,
  });
}

async function dispatchTerminalWheelBurst(client, deltaY) {
  const point = await visibleElementPoint(
    client,
    terminalScreenSelector,
    "the visible xterm screen",
  );
  for (let index = 0; index < 12; index += 1) {
    await dispatchPhysicalWheel(client, point, { deltaX: 0, deltaY });
  }
}

async function exerciseTerminalResize(client) {
  const resizeViewportDelta = -30;
  const before = await generatedTerminalGeometry(client);
  assert.ok(before.pane);
  const rowsBefore = await terminalRowCount(client);
  const splitterPoint = await visibleElementPoint(
    client,
    terminalSplitterSelector,
    "the terminal height splitter",
    { exactElementHit: true, preferredYFraction: 0.25 },
  );
  await dragBetweenPoints(client, splitterPoint, {
    x: splitterPoint.x,
    y: splitterPoint.y + resizeViewportDelta,
  });
  await waitFor(
    client,
    "the attached terminal height resize",
    `document.querySelector(${JSON.stringify(terminalPaneSelector)})?.getBoundingClientRect().height <= ${String(before.pane.height + resizeViewportDelta + 5)}`,
  );
  const afterHeight = await generatedTerminalGeometry(client);
  assert.ok(afterHeight.pane);
  assertApproximately(
    before.pane.height - afterHeight.pane.height,
    Math.abs(resizeViewportDelta),
    5,
    "The terminal did not map the viewport resize delta through the canvas scale.",
  );
  assertApproximately(
    afterHeight.editor.height,
    before.editor.height,
    2,
    "Resizing the terminal changed the code editor height.",
  );
  assertApproximately(
    afterHeight.group.height - before.group.height,
    afterHeight.pane.height - before.pane.height,
    2,
    "The joined group did not follow the terminal height delta.",
  );
  await waitFor(
    client,
    "xterm to fit fewer rows after the terminal height resize",
    `document.querySelector(${JSON.stringify(terminalRowsSelector)})?.children.length < ${String(rowsBefore)}`,
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
      const group = document.querySelector(${JSON.stringify(generatedGroupSelector)});
      const editor = document.querySelector(${JSON.stringify(`${generatedSectionSelector} .python-canvas-generated-python-editor`)});
      const pane = document.querySelector(${JSON.stringify(terminalPaneSelector)});
      if (!(section instanceof HTMLElement) || !(group instanceof HTMLElement) || !(editor instanceof HTMLElement)) {
        return null;
      }
      const box = (element) => {
        const rect = element.getBoundingClientRect();
        return { bottom: rect.bottom, height: rect.height, left: rect.left, right: rect.right, top: rect.top, width: rect.width };
      };
      return {
        editor: box(editor),
        group: box(group),
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
  assert.ok(
    rect.width > 0 && rect.height > 0,
    `${description} is not visible.`,
  );
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
    .map(
      (character) =>
        `\\${character.charCodeAt(0).toString(8).padStart(3, "0")}`,
    )
    .join("");
}

function hexShellText(value) {
  return [...value]
    .map((character) => character.charCodeAt(0).toString(16).padStart(2, "0"))
    .join("");
}
