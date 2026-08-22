import { setTimeout as delay } from "node:timers/promises";

import {
  fetchCanonicalSnapshot,
  productionTimeoutMs,
} from "./browser-processes.mjs";
import {
  clickElementCenter,
  evaluate,
  insertText,
  labeledSelector,
  movePointerTo,
  navigate,
  pressBackspace,
  pressDelete,
  pressEnd,
  pressHome,
  pressLeftArrow,
  pressRedo,
  pressRightArrow,
  pressUndo,
  selectAll,
  waitFor,
} from "./browser-page.mjs";

// The Python this walkthrough authors around the generated body. Both regions are real Python the
// store keeps, so each one is checked in the canonical project rather than only on screen.
const authoredPrefixLine = "import os";
const authoredSuffixLine = "print(state.Square_Root)";
const targetlessPrefixName = "undefined_prefix_name";

// The generated document is main's generated Python area: ordinary editable text around one
// declared range that refuses every edit touching it. These proofs drive real keys and a real
// pointer, and read the store after each one, because the whole point of the range is that the
// module it protects is the store's.
export async function assertAuthoredPythonAroundTheGeneratedBody(
  client,
  backendOrigin,
  previewOrigin,
  generatedLabel,
) {
  const canonical = await fetchCanonicalSnapshot(backendOrigin);
  await focusGeneratedDocument(client, generatedLabel);

  await assertProtectedRangeRefusesEveryEdit(
    client,
    backendOrigin,
    generatedLabel,
    canonical,
  );
  await assertAuthoredRegionsPersist(
    client,
    backendOrigin,
    previewOrigin,
    generatedLabel,
  );
}

// A provider diagnostic in the authored prefix has no generated semantic target. It must stay on
// the exact document range CodeMirror renders, rather than being lost or attached to the callable
// or a parameter. The test drives the same outer-code editing path as a person, reads the real
// canonical response, hovers the actual rendered range, and removes the authored error again.
export async function assertTargetlessDocumentDiagnostic(
  client,
  backendOrigin,
  generatedLabel,
) {
  const before = await fetchCanonicalSnapshot(backendOrigin);
  await focusGeneratedDocument(client, generatedLabel);
  await moveCaretToPrefixEnd(client);
  await insertText(client, `\n${targetlessPrefixName}`);

  const diagnosed = await waitForTargetlessDiagnostic(
    backendOrigin,
    "the authored prefix diagnostic",
    (snapshot) =>
      snapshot.pythonTarget?.prefix.endsWith(`\n${targetlessPrefixName}`),
    true,
  );
  const diagnostic = diagnosed.diagnostics.find(
    (candidate) => candidate.targetId === null,
  );
  if (diagnostic === undefined) {
    throw new Error("The authored prefix produced no targetless diagnostic.");
  }
  const diagnosticText = new TextDecoder().decode(
    new TextEncoder()
      .encode(diagnosed.generatedCode.code)
      .slice(diagnostic.start, diagnostic.end),
  );
  if (diagnosticText !== targetlessPrefixName) {
    throw new Error(
      `The targetless diagnostic covered ${JSON.stringify(diagnosticText)} instead of ${JSON.stringify(targetlessPrefixName)}.`,
    );
  }

  const paintedRange = await waitFor(
    client,
    "the rendered targetless diagnostic range",
    documentDiagnosticRangeScript(generatedLabel, targetlessPrefixName),
  );
  await movePointerTo(client, paintedRange.point);
  await waitFor(
    client,
    "the targetless diagnostic hover message",
    visibleDiagnosticMessageScript(generatedLabel, diagnostic.message),
  );

  // The exact characters added above are all outside the protected generated region. Deleting
  // them from its prefix boundary sends the next canonical target and must remove the old lint
  // range rather than leaving it attached to unrelated code.
  await moveCaretToPrefixEnd(client);
  for (const _character of `\n${targetlessPrefixName}`) {
    await pressDelete(client);
  }
  const cleared = await waitForTargetlessDiagnostic(
    backendOrigin,
    "the corrected authored prefix",
    (snapshot) => snapshot.pythonTarget?.prefix === before.pythonTarget.prefix,
  );
  // A later, independent document diagnostic would not make this corrected prefix stale. The
  // exact provider message that annotated the removed name must disappear; the next assertion
  // proves the same rule at the rendered CodeMirror boundary.
  if (
    cleared.diagnostics.some(
      (candidate) =>
        candidate.targetId === null && candidate.message === diagnostic.message,
    )
  ) {
    throw new Error(
      "Correcting the authored prefix retained its document diagnostic.",
    );
  }
  await waitFor(
    client,
    "the cleared targetless diagnostic message",
    `!(${visibleDiagnosticMessageScript(generatedLabel, diagnostic.message)})`,
  );
}

// A pointer press inside the generated block is how a person reaches this editor, and it must
// leave the caret somewhere authoring is allowed rather than inside output that refuses it.
async function focusGeneratedDocument(client, generatedLabel) {
  await clickElementCenter(
    client,
    `${labeledSelector(generatedLabel)} [role="textbox"]`,
    "the generated Python document",
  );
  const caret = await evaluate(client, caretPlacementScript(generatedLabel));
  if (caret === null) {
    throw new Error("The generated Python document took no caret at all.");
  }
  if (caret.insideBlock) {
    throw new Error(
      "A pointer press left the caret inside the generated block, where nothing typed can land.",
    );
  }
}

// Typing across the block, deleting forward from the end of the prefix, and deleting backward from
// the start of the suffix each reach the whole protected range. None of them may change one byte
// of the document or produce a new canonical revision.
async function assertProtectedRangeRefusesEveryEdit(
  client,
  backendOrigin,
  generatedLabel,
  canonical,
) {
  const source = await readGeneratedDocumentSource(client, generatedLabel);
  for (const [description, attempt] of [
    [
      "replacing the whole document",
      async () => {
        await selectAll(client);
        await insertText(client, "blocked");
      },
    ],
    [
      "deleting forward from the end of the prefix",
      async () => {
        await moveCaretToPrefixEnd(client);
        await pressDelete(client);
      },
    ],
    [
      "deleting backward from the start of the suffix",
      async () => {
        await moveCaretToSuffixStart(client);
        await pressBackspace(client);
      },
    ],
  ]) {
    await attempt();
    // Long enough for a change that was going to land to have landed, and for the controller's
    // own coalescing window to have proposed it.
    await delay(600);
    const after = await readGeneratedDocumentSource(client, generatedLabel);
    if (after !== source) {
      throw new Error(
        `The generated document accepted ${description}: ${JSON.stringify(after)}.`,
      );
    }
    const project = await fetchCanonicalSnapshot(backendOrigin);
    if (
      project.project.revision !== canonical.project.revision ||
      project.generatedCode.code !== canonical.generatedCode.code
    ) {
      throw new Error(
        `${description} reached the canonical project at revision ${String(project.project.revision)}.`,
      );
    }
  }
}

// The prefix and the suffix are ordinary authored Python: each survives the backend response and a
// page reload, while the generated body between them stays byte-for-byte what the store rendered.
async function assertAuthoredRegionsPersist(
  client,
  backendOrigin,
  previewOrigin,
  generatedLabel,
) {
  const before = await fetchCanonicalSnapshot(backendOrigin);

  await moveCaretToPrefixEnd(client);
  await insertText(client, `\n${authoredPrefixLine}`);
  const withPrefix = await waitForCanonicalTarget(
    backendOrigin,
    "the authored prefix",
    (target) => target.prefix.endsWith(`\n${authoredPrefixLine}`),
  );
  assertGeneratedBodyUnchanged("Authoring the prefix", before, withPrefix);

  await moveCaretToSuffixEnd(client);
  await insertText(client, `\n${authoredSuffixLine}`);
  const withSuffix = await waitForCanonicalTarget(
    backendOrigin,
    "the authored suffix",
    (target) => target.suffix.endsWith(`\n${authoredSuffixLine}`),
  );
  assertGeneratedBodyUnchanged("Authoring the suffix", before, withSuffix);

  // The canonical module is the two authored regions around the generated body, in that order.
  const expected = `${withSuffix.pythonTarget.prefix}\n\n${withSuffix.generatedCode.body}\n\n${withSuffix.pythonTarget.suffix}`;
  if (withSuffix.generatedCode.code !== expected) {
    throw new Error(
      `The canonical module does not compose its authored regions: ${JSON.stringify(withSuffix.generatedCode.code)}.`,
    );
  }

  await assertHistoryKeepsTheRangeAligned(
    client,
    backendOrigin,
    generatedLabel,
  );

  await navigate(client, previewOrigin);
  await waitForReloadedAuthoredRegions(client, generatedLabel);
}

// The reloaded page reads the same canonical project, so both authored regions come back with it.
// A failure here reports what the page actually rendered, because "the text is missing" and "the
// app never loaded" are different defects.
async function waitForReloadedAuthoredRegions(client, generatedLabel) {
  const deadline = Date.now() + productionTimeoutMs;
  let rendered = null;
  while (Date.now() < deadline) {
    rendered = await evaluate(client, reloadedDocumentScript(generatedLabel));
    if (
      rendered !== null &&
      rendered.source.includes(authoredPrefixLine) &&
      rendered.source.includes(authoredSuffixLine)
    ) {
      return;
    }
    await delay(100);
  }
  throw new Error(
    `The reloaded generated document did not hold both authored regions: ${JSON.stringify(rendered)}.`,
  );
}

function reloadedDocumentScript(generatedLabel) {
  return `(() => {
    const editor = document.querySelector(${JSON.stringify(`${labeledSelector(generatedLabel)} [role="textbox"]`)});
    return {
      alert: document.querySelector('[role="alert"]')?.textContent ?? null,
      editorPresent: editor !== null,
      source: editor?.textContent ?? "",
      status: document.querySelector('[role="status"]')?.textContent ?? null,
    };
  })()`;
}

// Undo and redo are user transactions like any other, so they take back and put back an accepted
// outer edit — through Go, and with the protected range still around the generated body.
async function assertHistoryKeepsTheRangeAligned(
  client,
  backendOrigin,
  generatedLabel,
) {
  await pressUndo(client);
  await waitForCanonicalTarget(
    backendOrigin,
    "the undone authored suffix",
    (target) => !target.suffix.includes(authoredSuffixLine),
  );
  await waitForGeneratedBlockAroundBody(client, backendOrigin, generatedLabel);

  await pressRedo(client);
  await waitForCanonicalTarget(
    backendOrigin,
    "the redone authored suffix",
    (target) => target.suffix.endsWith(`\n${authoredSuffixLine}`),
  );
  await waitForGeneratedBlockAroundBody(client, backendOrigin, generatedLabel);
}

// The block's own marks, read through the package's documented per-line hook, cover the canonical
// generated body and neither authored region.
async function waitForGeneratedBlockAroundBody(
  client,
  backendOrigin,
  generatedLabel,
) {
  const deadline = Date.now() + productionTimeoutMs;
  let block = null;
  while (Date.now() < deadline) {
    const canonical = await fetchCanonicalSnapshot(backendOrigin);
    block = await evaluate(client, generatedBlockTextScript(generatedLabel));
    if (
      block !== null &&
      block.marks[0] === "start" &&
      block.marks.at(-1) === "end" &&
      block.text.includes(canonical.generatedCode.body.split("\n")[0]) &&
      !block.text.includes(authoredPrefixLine) &&
      !block.text.includes(authoredSuffixLine)
    ) {
      return;
    }
    await delay(100);
  }
  throw new Error(
    `The generated block no longer bounds the canonical body: ${JSON.stringify(block)}.`,
  );
}

function assertGeneratedBodyUnchanged(stage, before, after) {
  if (after.generatedCode.body !== before.generatedCode.body) {
    throw new Error(
      `${stage} changed the generated body from ${JSON.stringify(before.generatedCode.body)} to ${JSON.stringify(after.generatedCode.body)}.`,
    );
  }
}

// Document-relative caret moves that need no coordinates: collapsing a full selection puts the
// caret at one end of the document, and Home/End reach that line's own boundary.
async function moveCaretToPrefixEnd(client) {
  await selectAll(client);
  await pressLeftArrow(client);
  await pressEnd(client);
}

async function moveCaretToSuffixStart(client) {
  await selectAll(client);
  await pressRightArrow(client);
  await pressHome(client);
}

async function moveCaretToSuffixEnd(client) {
  await selectAll(client);
  await pressRightArrow(client);
}

async function readGeneratedDocumentSource(client, generatedLabel) {
  const source = await evaluate(
    client,
    `document.querySelector(${JSON.stringify(`${labeledSelector(generatedLabel)} [role="textbox"]`)})?.textContent ?? null`,
  );
  if (typeof source !== "string") {
    throw new Error("The generated Python document rendered no text.");
  }
  return source;
}

async function waitForCanonicalTarget(backendOrigin, description, matches) {
  const deadline = Date.now() + productionTimeoutMs;
  let target = null;
  while (Date.now() < deadline) {
    const canonical = await fetchCanonicalSnapshot(backendOrigin);
    target = canonical.pythonTarget;
    if (matches(target)) {
      return canonical;
    }
    await delay(100);
  }
  throw new Error(
    `${description} did not reach the canonical project: ${JSON.stringify(target)}.`,
  );
}

// A canonical response publishes its source and diagnostics together. The first caller needs the
// new targetless diagnostic as well as the authored prefix; the clearing caller then checks the
// removed name's exact provider message, without treating a distinct later document diagnostic as
// its stale range.
async function waitForTargetlessDiagnostic(
  backendOrigin,
  description,
  matches,
  requiresTargetlessDiagnostic = false,
) {
  const deadline = Date.now() + productionTimeoutMs;
  let canonical = null;
  while (Date.now() < deadline) {
    canonical = await fetchCanonicalSnapshot(backendOrigin);
    const hasTargetlessDiagnostic = canonical.diagnostics.some(
      (diagnostic) => diagnostic.targetId === null,
    );
    if (
      matches(canonical) &&
      (!requiresTargetlessDiagnostic || hasTargetlessDiagnostic)
    ) {
      return canonical;
    }
    await delay(100);
  }
  throw new Error(
    `${description} did not reach the canonical project: ${JSON.stringify(canonical?.pythonTarget)}.`,
  );
}

// The lint package publishes decorations asynchronously, so wait until the target text carries
// visible diagnostic ink rather than treating the first rendered copy of the text as final. The
// production proof remains independent of the package's DOM classes: it checks the decoration's
// visual property, which stays valid if CodeMirror changes its wrapping.
function documentDiagnosticRangeScript(generatedLabel, text) {
  return `(() => {
    const editor = document.querySelector(${JSON.stringify(`${labeledSelector(generatedLabel)} [role="textbox"]`)});
    if (!(editor instanceof HTMLElement)) {
      return null;
    }
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const start = node.textContent?.indexOf(${JSON.stringify(text)}) ?? -1;
      if (start < 0) {
        continue;
      }
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + ${text.length});
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        continue;
      }
      let element = node.parentElement;
      let hasDiagnosticInk = false;
      while (element instanceof HTMLElement && editor.contains(element)) {
        const style = window.getComputedStyle(element);
        if (
          style.backgroundImage !== "none" ||
          style.textDecorationLine.includes("underline")
        ) {
          hasDiagnosticInk = true;
          break;
        }
        element = element.parentElement;
      }
      if (!hasDiagnosticInk) {
        return null;
      }
      return {
        point: {
          x: rect.x + Math.max(1, Math.min(8, rect.width / 2)),
          y: rect.y + rect.height / 2,
        },
      };
    }
    return null;
  })()`;
}

// A hover tooltip is the accessible, visible explanation of the underline. Look for its actual
// rendered text rather than the lint package's private tooltip class, and exclude the editor's
// source text so the source identifier itself cannot satisfy the assertion.
function visibleDiagnosticMessageScript(generatedLabel, message) {
  return `(() => {
    const editor = document.querySelector(${JSON.stringify(`${labeledSelector(generatedLabel)} [role="textbox"]`)});
    return Array.from(document.querySelectorAll("body *")).some((element) => {
      if (!(element instanceof HTMLElement) || editor?.contains(element)) {
        return false;
      }
      if (element.textContent?.trim() !== ${JSON.stringify(message)}) {
        return false;
      }
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
    });
  })()`;
}

// Where the caret is, in the only vocabulary this package publishes for the block: the line it
// sits on either carries the generated mark or it does not.
function caretPlacementScript(generatedLabel) {
  return `(() => {
    const editor = document.querySelector(${JSON.stringify(`${labeledSelector(generatedLabel)} [role="textbox"]`)});
    const selection = window.getSelection();
    const node = selection?.anchorNode ?? null;
    const element = node instanceof Element ? node : (node?.parentElement ?? null);
    if (!(editor instanceof HTMLElement) || !(element instanceof Element) || !editor.contains(element)) {
      return null;
    }
    return { insideBlock: element.closest('[data-workspace-generated-line]') !== null };
  })()`;
}

function generatedBlockTextScript(generatedLabel) {
  return `(() => {
    const lines = [...document.querySelectorAll(${JSON.stringify(`${labeledSelector(generatedLabel)} [data-workspace-generated-line]`)})];
    if (lines.length === 0) {
      return null;
    }
    return {
      marks: lines.map((line) => line.getAttribute("data-workspace-generated-line")),
      text: lines.map((line) => line.textContent).join("\\n"),
    };
  })()`;
}
