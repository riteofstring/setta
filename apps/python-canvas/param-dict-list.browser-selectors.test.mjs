import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

import {
  callableSectionSelector,
  callableWorkspaceSectionId,
  listSectionSelector,
  parameterDictionarySectionSelector,
} from "./param-dict-list.browser-support.mjs";
import { dragElementToElement } from "./browser-page.mjs";
import {
  dictionaryEntryChildAdoptionDragTarget,
  listNestedSectionSurfaceSelector,
  listNestedSortableSectionSelector,
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
