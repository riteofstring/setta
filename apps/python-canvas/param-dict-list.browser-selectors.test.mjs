import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

import {
  assertFocusNotStolenAfterSectionMove,
  callableSectionSelector,
  callableWorkspaceSectionId,
  captureFocusBeforeSectionMove,
  focusNotStolenAfterSectionMoveExpression,
  listSectionSelector,
  parameterDictionarySectionSelector,
} from "./param-dict-list.browser-support.mjs";
import { dragElementToElement } from "./browser-page.mjs";
import {
  dictionaryEntryChildAdoptionDragTarget,
  listNestedChildOrderExpression,
  listNestedSectionSurfaceSelector,
  listNestedSortableSectionSelector,
  waitForSectionDragModeRelease,
  waitForListNestedChildOrder,
} from "./param-dict-list.browser.mjs";

test("Param Dict and List walkthrough selectors use workspace section identities", () => {
  assert.equal(
    callableSectionSelector("callable:child"),
    '[data-section-id="python-canvas:callable:callable:child"]',
  );
  assert.equal(
    callableWorkspaceSectionId("callable:child"),
    "python-canvas:callable:callable:child",
  );
  assert.equal(
    parameterDictionarySectionSelector("dictionary:options"),
    '[data-section-id="python-canvas:parameter-dictionary:dictionary:options"]',
  );
  assert.equal(
    listSectionSelector("list:objects"),
    '[data-section-id="python-canvas:list:list:objects"]',
  );
});

test("List walkthrough reorders a Param Dict with the proven free move gesture", async () => {
  const walkthrough = await readFile(
    new URL("./param-dict-list.browser.mjs", import.meta.url),
    "utf8",
  );

  assert.match(
    walkthrough,
    /const dictionaryReorderFocus = await dragFreeSectionToSection\(\s*client,\s*dictionarySelector,\s*callableSectionSelector\(outerChildIds\[0\]\),\s*"reordering the Param Dict to the front of the list",\s*0\.25,/,
  );
  assert.doesNotMatch(walkthrough, /dragSortedSectionToSection/);
});

test("List walkthrough finds direct vertical children beside its shell", () => {
  const document = new JSDOM(`
    <div>
      <div data-section-id="python-canvas:list:list:objects"></div>
      <div class="flex flex-col">
        <div class="flex items-stretch">
          <div class="mt-2 flex flex-col items-start gap-2">
            <div data-sortable-section-id="python-canvas:callable:callable:one"></div>
            <div data-sortable-section-id="python-canvas:callable:callable:two"></div>
          </div>
        </div>
      </div>
    </div>
  `).window.document;
  const shell = document.querySelector(listSectionSelector("list:objects"));
  if (!(shell instanceof document.defaultView.HTMLElement)) {
    throw new Error("Expected the List of Objects shell.");
  }
  const wrapper = shell.parentElement;
  if (!(wrapper instanceof document.defaultView.HTMLElement)) {
    throw new Error("Expected the List of Objects wrapper.");
  }

  assert.deepEqual(
    Array.from(wrapper.querySelectorAll(listNestedSortableSectionSelector)).map(
      (sortable) => sortable.getAttribute("data-sortable-section-id"),
    ),
    [
      "python-canvas:callable:callable:one",
      "python-canvas:callable:callable:two",
    ],
  );
  assert.equal(shell.querySelectorAll("[data-sortable-section-id]").length, 0);
  assert.ok(
    wrapper.querySelector(listNestedSectionSurfaceSelector) instanceof
      document.defaultView.HTMLElement,
  );
});

test("Section move focus check never accepts an unrelated active control", async () => {
  const sameElement = focusFixture();
  sameElement.source.focus();
  const sameElementCapture = await captureFocusBeforeSectionMove(
    sameElement.client,
    sameElement.sourceSelector,
  );
  await assertFocusNotStolenAfterSectionMove(
    sameElement.client,
    sameElementCapture,
  );

  const bodyFallback = focusFixture();
  bodyFallback.source.focus();
  const bodyFallbackCapture = await captureFocusBeforeSectionMove(
    bodyFallback.client,
    bodyFallback.sourceSelector,
  );
  remountSource(bodyFallback);
  bodyFallback.document.body.tabIndex = -1;
  bodyFallback.document.body.focus();
  await assertFocusNotStolenAfterSectionMove(
    bodyFallback.client,
    bodyFallbackCapture,
  );

  const canvasFallback = focusFixture();
  canvasFallback.source.focus();
  const canvasFallbackCapture = await captureFocusBeforeSectionMove(
    canvasFallback.client,
    canvasFallback.sourceSelector,
  );
  remountSource(canvasFallback);
  canvasFallback.canvas.tabIndex = -1;
  canvasFallback.canvas.focus();
  await assertFocusNotStolenAfterSectionMove(
    canvasFallback.client,
    canvasFallbackCapture,
  );

  const movedSection = focusFixture();
  movedSection.source.focus();
  const movedSectionCapture = await captureFocusBeforeSectionMove(
    movedSection.client,
    movedSection.sourceSelector,
  );
  const remountedSection = remountSource(movedSection);
  const remountedControl = movedSection.document.createElement("button");
  remountedControl.type = "button";
  remountedSection.append(remountedControl);
  remountedControl.focus();
  await assertFocusNotStolenAfterSectionMove(
    movedSection.client,
    movedSectionCapture,
  );

  const unrelatedControl = focusFixture();
  unrelatedControl.source.focus();
  const unrelatedCapture = await captureFocusBeforeSectionMove(
    unrelatedControl.client,
    unrelatedControl.sourceSelector,
  );
  remountSource(unrelatedControl);
  unrelatedControl.otherControl.focus();
  assert.equal(
    unrelatedControl.window.eval(
      focusNotStolenAfterSectionMoveExpression(
        unrelatedCapture.captureKey,
        unrelatedCapture.movedSectionSelector,
      ),
    ),
    false,
  );
  unrelatedControl.window.eval(
    `delete globalThis[${JSON.stringify(unrelatedCapture.captureKey)}]`,
  );
});

test("List walkthrough waits for projected direct sortable children in canonical order", async () => {
  const window = new JSDOM(
    `
      <div>
        <div data-section-id="python-canvas:list:list:objects"></div>
        <div class="flex flex-col">
          <div class="flex items-stretch">
            <div class="mt-2 flex flex-col items-start gap-2"></div>
          </div>
        </div>
      </div>
    `,
    { runScripts: "outside-only" },
  ).window;
  const document = window.document;
  const expectedChildIds = [
    callableWorkspaceSectionId("callable:one"),
    callableWorkspaceSectionId("callable:two"),
  ];
  const shell = document.querySelector(listSectionSelector("list:objects"));
  const wrapper = shell?.parentElement;
  const surface = wrapper?.querySelector(listNestedSectionSurfaceSelector);
  if (!(surface instanceof window.HTMLElement)) {
    throw new Error("Expected the List of Objects nested section surface.");
  }
  const appendSortable = (id) => {
    const sortable = document.createElement("div");
    sortable.setAttribute("data-sortable-section-id", id);
    surface.append(sortable);
  };
  const evaluations = [];
  const client = {
    async send(method, parameters) {
      assert.equal(method, "Runtime.evaluate");
      evaluations.push(parameters.expression);
      const value = window.eval(parameters.expression);
      if (evaluations.length === 1) {
        appendSortable(expectedChildIds[1]);
        appendSortable(expectedChildIds[0]);
      } else if (evaluations.length === 2) {
        surface.replaceChildren();
        expectedChildIds.forEach(appendSortable);
      }
      return { result: { value } };
    },
  };

  assert.equal(
    window.eval(
      listNestedChildOrderExpression("list:objects", expectedChildIds),
    ),
    false,
  );
  await waitForListNestedChildOrder(client, "list:objects", expectedChildIds);
  assert.equal(evaluations.length, 3);
});

test("Section drag waits for its previous mode to deactivate before another gesture", async () => {
  const window = new JSDOM(
    `
      <div class="nodrag">
        <div data-section-id="python-canvas:parameter-dictionary:dictionary:options"></div>
      </div>
    `,
    { runScripts: "outside-only" },
  ).window;
  const document = window.document;
  const source = document.querySelector(
    parameterDictionarySectionSelector("dictionary:options"),
  );
  if (!(source instanceof window.HTMLElement) || !source.parentElement) {
    throw new Error("Expected the section drag source.");
  }
  const evaluations = [];
  const client = {
    async send(method, parameters) {
      assert.equal(method, "Runtime.evaluate");
      evaluations.push(parameters.expression);
      const value = window.eval(parameters.expression);
      if (evaluations.length === 1) {
        source.parentElement.classList.remove("nodrag");
      }
      return { result: { value } };
    },
  };

  await waitForSectionDragModeRelease(
    client,
    parameterDictionarySectionSelector("dictionary:options"),
  );

  assert.equal(evaluations.length, 2);
});

function focusFixture() {
  const window = new JSDOM(
    `
      <main>
        <div role="region" aria-label="Workspace canvas" tabindex="-1">
          <div class="react-flow__pane" aria-label="Workspace canvas background" tabindex="-1">
            <div data-section-id="python-canvas:parameter-dictionary:dictionary:options" tabindex="-1"></div>
            <button type="button" data-unrelated-control="true">Other section control</button>
          </div>
        </div>
      </main>
    `,
    { runScripts: "outside-only" },
  ).window;
  const document = window.document;
  const sourceSelector = parameterDictionarySectionSelector("dictionary:options");
  const source = document.querySelector(sourceSelector);
  const canvas = document.querySelector(
    '.react-flow__pane[aria-label="Workspace canvas background"]',
  );
  const otherControl = document.querySelector("[data-unrelated-control='true']");
  if (
    !(source instanceof window.HTMLElement) ||
    !(canvas instanceof window.HTMLElement) ||
    !(otherControl instanceof window.HTMLButtonElement)
  ) {
    throw new Error("Expected the focus-check fixture controls.");
  }
  return {
    canvas,
    client: {
      async send(method, parameters) {
        assert.equal(method, "Runtime.evaluate");
        return { result: { value: window.eval(parameters.expression) } };
      },
    },
    document,
    otherControl,
    source,
    sourceSelector,
    window,
  };
}

function remountSource(fixture) {
  const remounted = fixture.document.createElement("div");
  remounted.setAttribute(
    "data-section-id",
    "python-canvas:parameter-dictionary:dictionary:options",
  );
  remounted.tabIndex = -1;
  fixture.source.replaceWith(remounted);
  return remounted;
}

test("Param Dict nesting targets the rightward item child-adoption lane", async () => {
  const evaluations = [];
  const mouseEvents = [];
  const evaluationResults = [
    { point: { x: 10, y: 20 } },
    { height: 24, width: 300, x: 0, y: 100 },
    { point: { x: 150, y: 112 } },
    true,
    true,
    true,
    true,
  ];
  const client = {
    async send(method, parameters) {
      if (method === "Runtime.evaluate") {
        evaluations.push(parameters.expression);
        return { result: { value: evaluationResults.shift() } };
      }
      if (method === "Input.dispatchMouseEvent") {
        mouseEvents.push(parameters);
      }
      return {};
    },
  };

  await dragElementToElement(
    client,
    "[data-source]",
    "[data-target]",
    "the nested dictionary drop",
    0,
    dictionaryEntryChildAdoptionDragTarget,
  );

  assert.match(evaluations[2] ?? "", /preferredXFraction = 0\.5/);
  assert.deepEqual(
    mouseEvents.slice(-2).map(({ type, x, y }) => ({ type, x, y })),
    [
      { type: "mouseMoved", x: 150, y: 112 },
      { type: "mouseReleased", x: 150, y: 112 },
    ],
  );
});
