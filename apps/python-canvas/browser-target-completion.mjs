import { setTimeout as delay } from "node:timers/promises";

import { fetchCanonicalSnapshot } from "./browser-processes.mjs";
import {
  activateLabeledCodeSection,
  evaluate,
  insertText,
  labeledSelector,
  moveCaretToGeneratedPrefixBoundary,
  navigate,
  pauseResponseAtCdpBoundary,
  pressEnd,
  pressEscape,
  pressLeftArrow,
  pressRightArrow,
  pressCompletion,
  pressEnter,
  pressTab,
  selectAll,
  waitForAnimationFrame,
  waitFor,
} from "./browser-page.mjs";

const tooltipParentSelector = ".setta-workspace-codemirror-tooltips";
const autocompleteSelector = ".cm-tooltip-autocomplete";

// The target-completion acceptance path runs against the real production app and its pinned
// provider. It uses only editor keys and the Code section's public accessible surface: no store
// writes, test-only completion source, or synthetic CodeMirror transaction stands in for a reader.
export async function assertPythonTargetCompletionParity(
  client,
  backendOrigin,
  previewOrigin,
  generatedLabel,
) {
  await assertPopupEscapeOwnership(client, backendOrigin, generatedLabel);
  await assertPrefixTabCompletion(
    client,
    backendOrigin,
    previewOrigin,
    generatedLabel,
  );
  await assertSuffixEnterCompletion(
    client,
    backendOrigin,
    previewOrigin,
    generatedLabel,
  );
  await assertProtectedRegionSuppressesCompletion(
    client,
    backendOrigin,
    generatedLabel,
  );
  await assertStaleCompletionCannotReopenOrReport(
    client,
    backendOrigin,
    previewOrigin,
    generatedLabel,
  );
}

async function assertPopupEscapeOwnership(
  client,
  backendOrigin,
  generatedLabel,
) {
  const before = await fetchCanonicalSnapshot(backendOrigin);
  await activateLabeledCodeSection(client, generatedLabel);
  await moveCaretToSuffixEnd(client);
  // The line ends in `()`. Three Left presses put the caret inside the existing class identifier,
  // so this opens a real completion without changing authored text or starting a target mutation.
  await pressLeftArrow(client);
  await pressLeftArrow(client);
  await pressLeftArrow(client);
  await pressCompletion(client);
  await waitForTargetPopup(client, generatedLabel, "SettaState");

  await pressEscape(client);
  await waitForNoTargetPopup(client);
  assertProjectUnchanged(
    "The first Escape over a target completion",
    before,
    await fetchCanonicalSnapshot(backendOrigin),
  );
  await pressEscape(client);
  await waitFor(
    client,
    "the second Escape returning target-editor focus to its section wrapper",
    `document.activeElement === document.querySelector(${JSON.stringify(labeledSelector(generatedLabel))})`,
  );
}

async function assertPrefixTabCompletion(
  client,
  backendOrigin,
  previewOrigin,
  generatedLabel,
) {
  const before = await fetchCanonicalSnapshot(backendOrigin);
  await activateLabeledCodeSection(client, generatedLabel);
  await moveCaretToGeneratedPrefixBoundary(client, generatedLabel);
  // This complete import statement has a stable `sqrt` completion in the pinned provider. Moving
  // back one UTF-16 position keeps the cursor outside the protected range while the identifier's
  // replacement range still covers the whole partial token.
  await insertText(client, "\nfrom math import sqr");
  await pressLeftArrow(client);
  await pressCompletion(client);
  const popup = await waitForTargetPopup(client, generatedLabel, "sqrt");
  await inspectTargetPopupAtOriginalResolution(client, popup);
  await pressTab(client);
  await waitFor(
    client,
    "Tab accepting only the authored prefix completion",
    generatedSourceIncludesScript(generatedLabel, "from math import sqrt"),
  );
  const after = await waitForCanonicalTarget(
    backendOrigin,
    "the accepted prefix completion",
    (snapshot) =>
      snapshot.pythonTarget?.prefix?.includes("from math import sqrt") === true,
  );
  if (after.pythonTarget.suffix !== before.pythonTarget.suffix) {
    throw new Error(
      "Accepting the prefix completion changed the authored suffix.",
    );
  }
  if (after.generatedCode.body !== before.generatedCode.body) {
    throw new Error(
      "Accepting the prefix completion changed the generated body.",
    );
  }
  await navigate(client, previewOrigin);
  await waitFor(
    client,
    "the reloaded completed prefix",
    generatedSourceIncludesScript(generatedLabel, "from math import sqrt"),
  );
}

async function assertSuffixEnterCompletion(
  client,
  backendOrigin,
  previewOrigin,
  generatedLabel,
) {
  const before = await fetchCanonicalSnapshot(backendOrigin);
  await activateLabeledCodeSection(client, generatedLabel);
  await moveCaretToSuffixEnd(client);
  await insertText(client, "\nstate = SettaSta");
  await pressLeftArrow(client);
  await pressCompletion(client);
  const popup = await waitForTargetPopup(client, generatedLabel, "SettaState");
  await inspectTargetPopupAtOriginalResolution(client, popup);
  await pressEnter(client);
  await waitFor(
    client,
    "Enter accepting only the authored suffix completion",
    generatedSourceIncludesScript(generatedLabel, "state = SettaState"),
  );
  const after = await waitForCanonicalTarget(
    backendOrigin,
    "the accepted suffix completion",
    (snapshot) =>
      snapshot.pythonTarget?.suffix?.endsWith("state = SettaState") === true,
  );
  if (after.pythonTarget.prefix !== before.pythonTarget.prefix) {
    throw new Error(
      "Accepting the suffix completion changed the authored prefix.",
    );
  }
  if (after.generatedCode.body !== before.generatedCode.body) {
    throw new Error(
      "Accepting the suffix completion changed the generated body.",
    );
  }
  await navigate(client, previewOrigin);
  await waitFor(
    client,
    "the reloaded completed suffix",
    generatedSourceIncludesScript(generatedLabel, "state = SettaState"),
  );
}

async function assertProtectedRegionSuppressesCompletion(
  client,
  backendOrigin,
  generatedLabel,
) {
  const before = await fetchCanonicalSnapshot(backendOrigin);
  const beforeRequests = await completionRequestCount(client);
  await activateLabeledCodeSection(client, generatedLabel);
  // A full selection collapsed right moves to the suffix. Home reaches that line's generated
  // separator, then Right enters the protected body as a real caret move; atomic ranges snap the
  // caret past it, so click the visible body to prove the protected position has no popup instead.
  const focused = await evaluate(
    client,
    `(() => {
      const editor = document.querySelector(${JSON.stringify(`${labeledSelector(generatedLabel)} [role="textbox"]`)});
      const line = editor?.querySelector('[data-workspace-generated-line]');
      if (!(editor instanceof HTMLElement) || !(line instanceof HTMLElement)) {
        return null;
      }
      const rect = line.getBoundingClientRect();
      return { x: rect.left + Math.min(12, rect.width / 2), y: rect.top + rect.height / 2 };
    })()`,
  );
  if (focused === null) {
    throw new Error(
      "The generated block did not expose a visible protected line.",
    );
  }
  await client.send("Input.dispatchMouseEvent", {
    ...focused,
    button: "left",
    buttons: 1,
    clickCount: 1,
    type: "mousePressed",
  });
  await client.send("Input.dispatchMouseEvent", {
    ...focused,
    button: "left",
    buttons: 0,
    clickCount: 1,
    type: "mouseReleased",
  });
  await pressCompletion(client);
  // Explicit completion work reaches the provider asynchronously. Observe a real window after
  // the request before declaring the protected region silent, rather than accepting the same
  // browser turn in which it was requested.
  await observeProtectedRegionCompletionWindow(client, beforeRequests);
  await waitForNoTargetPopup(client);
  const afterRequests = await completionRequestCount(client);
  if (afterRequests !== beforeRequests) {
    throw new Error(
      "A protected generated-region cursor sent a completion endpoint request.",
    );
  }
  assertProjectUnchanged(
    "A protected generated-region completion attempt",
    before,
    await fetchCanonicalSnapshot(backendOrigin),
  );
}

async function assertStaleCompletionCannotReopenOrReport(
  client,
  backendOrigin,
  previewOrigin,
  generatedLabel,
) {
  const heldResponse = await pauseResponseAtCdpBoundary(
    client,
    "the older target completion",
    `${previewOrigin}/api/v1/project/python-target/completions`,
  );
  await activateLabeledCodeSection(client, generatedLabel);
  await moveCaretToGeneratedPrefixBoundary(client, generatedLabel);
  await insertText(client, "\nfrom math import floo");
  // The new text ends at the protected boundary, where completion is deliberately unavailable.
  // Step into the partial identifier for the request, then return to its line end to author the
  // newer text while that real response remains paused.
  await pressLeftArrow(client);
  await pressCompletion(client);
  await heldResponse.wait();
  // The production response for `floo` is now paused at the browser boundary. Add the final
  // letter before delivering it; a late response may neither reopen a popup nor publish the
  // target-completion error on this newer document.
  await pressEnd(client);
  await insertText(client, "r");
  await heldResponse.release();
  await waitForAnimationFrame(client);
  await waitForNoTargetPopup(client);
  const state = await evaluate(
    client,
    `(() => ({
      alert: document.querySelector('.python-canvas-completion-error')?.textContent ?? null,
      source: document.querySelector(${JSON.stringify(`${labeledSelector(generatedLabel)} [role="textbox"]`)})?.textContent ?? "",
    }))()`,
  );
  if (
    state.alert !== null ||
    !state.source.includes("from math import floor")
  ) {
    throw new Error(
      `A stale target completion changed or reported the newer document: ${JSON.stringify(state)}.`,
    );
  }
  // The newer `floor` text is ordinary authored Python, so its existing debounce reaches the
  // canonical target before the next browser proof starts from that same document state.
  await waitForCanonicalTarget(
    backendOrigin,
    "the newer authored prefix after a stale completion response",
    (snapshot) =>
      snapshot.pythonTarget?.prefix?.includes("from math import floor") === true,
  );
}

async function moveCaretToSuffixEnd(client) {
  await selectAll(client);
  await pressRightArrow(client);
}

async function waitForTargetPopup(client, generatedLabel, label) {
  return waitFor(
    client,
    `${label} completion beside Generated Python`,
    targetPopupScript(generatedLabel, label),
  );
}

async function waitForNoTargetPopup(client) {
  await waitFor(
    client,
    "the Generated Python completion popup closing",
    `document.querySelector(${JSON.stringify(autocompleteSelector)}) === null`,
  );
}

function targetPopupScript(generatedLabel, label) {
  return `(() => {
    const wrapper = document.querySelector(${JSON.stringify(labeledSelector(generatedLabel))});
    const section = wrapper?.closest('[data-section-id]');
    const parent = document.querySelector(${JSON.stringify(tooltipParentSelector)});
    const popup = Array.from(document.querySelectorAll(${JSON.stringify(autocompleteSelector)})).find(
      (candidate) => candidate instanceof HTMLElement && candidate.textContent?.includes(${JSON.stringify(label)}),
    );
    if (!(wrapper instanceof HTMLElement) || !(section instanceof HTMLElement) || !(parent instanceof HTMLElement) || !(popup instanceof HTMLElement)) {
      return null;
    }
    const rect = popup.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || rect.bottom <= 0) {
      return null;
    }
    return {
      devicePixelRatio: window.devicePixelRatio,
      parentContainsPopup: parent.contains(popup),
      popup: { bottom: rect.bottom, height: rect.height, left: rect.left, right: rect.right, top: rect.top, width: rect.width },
      sectionContainsPopup: section.contains(popup),
      viewport: { height: window.innerHeight, width: window.innerWidth },
      wrapperContainsPopup: wrapper.contains(popup),
    };
  })()`;
}

async function inspectTargetPopupAtOriginalResolution(client, popup) {
  if (
    popup.viewport.width !== 1_440 ||
    popup.viewport.height !== 900 ||
    popup.devicePixelRatio !== 1 ||
    !popup.parentContainsPopup ||
    popup.sectionContainsPopup ||
    popup.wrapperContainsPopup ||
    popup.popup.left < 0 ||
    popup.popup.top < 0 ||
    popup.popup.right > popup.viewport.width ||
    popup.popup.bottom > popup.viewport.height
  ) {
    throw new Error(
      `The Generated Python completion popup was not visible at the required original-resolution canvas placement: ${JSON.stringify(popup)}.`,
    );
  }
  const screenshot = await client.send("Page.captureScreenshot", {
    captureBeyondViewport: false,
    format: "png",
  });
  if (typeof screenshot.data !== "string" || screenshot.data.length < 1_000) {
    throw new Error(
      "The original-resolution Generated Python popup capture was empty.",
    );
  }
}

async function observeProtectedRegionCompletionWindow(client, beforeRequests) {
  const deadline = Date.now() + 700;
  while (Date.now() < deadline) {
    const state = await evaluate(
      client,
      `(() => ({
        hasPopup: document.querySelector(${JSON.stringify(autocompleteSelector)}) !== null,
        requestCount: performance.getEntriesByType("resource").filter((entry) => entry.name.includes("/api/v1/project/python-target/completions")).length,
      }))()`,
    );
    if (state.hasPopup || state.requestCount !== beforeRequests) {
      throw new Error(
        "A protected generated-region cursor opened a completion popup or sent a completion endpoint request.",
      );
    }
    await delay(100);
  }
}

function generatedSourceIncludesScript(generatedLabel, text) {
  return `document.querySelector(${JSON.stringify(`${labeledSelector(generatedLabel)} [role="textbox"]`)})?.textContent?.includes(${JSON.stringify(text)}) === true`;
}

async function completionRequestCount(client) {
  return evaluate(
    client,
    `performance.getEntriesByType("resource").filter((entry) => entry.name.includes("/api/v1/project/python-target/completions")).length`,
  );
}

async function waitForCanonicalTarget(backendOrigin, description, matches) {
  const deadline = Date.now() + 30_000;
  let current = null;
  while (Date.now() < deadline) {
    current = await fetchCanonicalSnapshot(backendOrigin);
    if (matches(current)) {
      return current;
    }
    await delay(100);
  }
  throw new Error(
    `${description} did not reach the canonical target: ${JSON.stringify(current?.pythonTarget)}.`,
  );
}

function assertProjectUnchanged(stage, before, after) {
  if (
    before.project?.revision !== after.project?.revision ||
    JSON.stringify(before.pythonTarget) !==
      JSON.stringify(after.pythonTarget) ||
    JSON.stringify(before.generatedCode) !== JSON.stringify(after.generatedCode)
  ) {
    throw new Error(`${stage} changed canonical project state.`);
  }
}
