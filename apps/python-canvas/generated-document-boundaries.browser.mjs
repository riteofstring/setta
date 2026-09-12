import assert from "node:assert/strict";

import { fetchCanonicalSnapshot } from "./browser-processes.mjs";
import { generatedPythonEditorSelector } from "./python-target.browser.mjs";
import {
  activateCodeEditor,
  clickPoint,
  dragBetweenPoints,
  evaluate,
  insertText,
  moveCaretToDocumentEnd,
  moveCaretToDocumentStart,
  nextAnimationFrame,
  pressCompletion,
  pressEnd,
  pressEscape,
  waitFor,
} from "./browser-page.mjs";

export async function observeGeneratedDocumentBoundaries(
  client,
  backendOrigin,
) {
  const beforeOuterCompletion = await targetCompletionRequestCount(client);
  await activateCodeEditor(
    client,
    generatedPythonEditorSelector,
    "the Generated Python document",
  );
  await moveCaretToDocumentStart(client);
  await pressEnd(client);
  await pressCompletion(client);
  await waitForTargetCompletionRequest(
    client,
    beforeOuterCompletion,
    "a prefix completion request",
  );
  await pressEscape(client);

  const beforeSuffixCompletion = await targetCompletionRequestCount(client);
  await activateCodeEditor(
    client,
    generatedPythonEditorSelector,
    "the Generated Python document",
  );
  await moveCaretToDocumentEnd(client);
  await pressCompletion(client);
  await waitForTargetCompletionRequest(
    client,
    beforeSuffixCompletion,
    "a suffix completion request",
  );
  await pressEscape(client);

  const beforeRejectedEdit = await fetchCanonicalSnapshot(backendOrigin);
  const protectedPoints = await generatedBodySelectionPoints(client);
  await dragBetweenPoints(client, protectedPoints.start, protectedPoints.end);
  await insertText(client, "blocked generated change");
  await nextAnimationFrame(client);
  const afterRejectedEdit = await fetchCanonicalSnapshot(backendOrigin);
  assert.equal(
    afterRejectedEdit.generatedCode.code,
    beforeRejectedEdit.generatedCode.code,
    "A transaction that touched the generated body changed canonical Python.",
  );

  const beforeProtectedCompletion = await targetCompletionRequestCount(client);
  await clickPoint(client, protectedPoints.center);
  await pressCompletion(client);
  await nextAnimationFrame(client);
  await nextAnimationFrame(client);
  assert.equal(
    await targetCompletionRequestCount(client),
    beforeProtectedCompletion,
    "A generated-body cursor requested target completion.",
  );
}

async function generatedBodySelectionPoints(client) {
  const points = await evaluate(
    client,
    `(() => {
      const editor = document.querySelector(${JSON.stringify(`${generatedPythonEditorSelector} [role="textbox"]`)});
      if (!(editor instanceof HTMLElement)) {
        return null;
      }
      const lines = Array.from(editor.querySelectorAll("[data-workspace-generated-line]"));
      const first = lines[0];
      const last = lines.at(-1);
      if (!(first instanceof HTMLElement) || !(last instanceof HTMLElement)) {
        return null;
      }
      const firstRect = first.getBoundingClientRect();
      const lastRect = last.getBoundingClientRect();
      if (firstRect.width <= 0 || firstRect.height <= 0 || lastRect.width <= 0 || lastRect.height <= 0) {
        return null;
      }
      return {
        center: { x: firstRect.left + firstRect.width / 2, y: firstRect.top + firstRect.height / 2 },
        end: { x: lastRect.right - 2, y: lastRect.top + lastRect.height / 2 },
        start: { x: firstRect.left + 2, y: firstRect.top + firstRect.height / 2 },
      };
    })()`,
  );
  assert.ok(
    points,
    "The Generated Python body did not expose visible line marks.",
  );
  return points;
}

async function targetCompletionRequestCount(client) {
  return evaluate(
    client,
    `performance.getEntriesByType("resource").filter((entry) => {
      try {
        return new URL(entry.name).pathname === "/api/v2/project/target/completions";
      } catch {
        return false;
      }
    }).length`,
  );
}

async function waitForTargetCompletionRequest(client, before, description) {
  await waitFor(
    client,
    description,
    `performance.getEntriesByType("resource").filter((entry) => {
      try {
        return new URL(entry.name).pathname === "/api/v2/project/target/completions";
      } catch {
        return false;
      }
    }).length > ${String(before)}`,
  );
}
