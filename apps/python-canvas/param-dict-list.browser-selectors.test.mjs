import assert from "node:assert/strict";
import test from "node:test";

import {
  callableSectionSelector,
  listSectionSelector,
  parameterDictionarySectionSelector,
} from "./param-dict-list.browser-support.mjs";

test("Param Dict and List walkthrough selectors use workspace section identities", () => {
  assert.equal(
    callableSectionSelector("callable:child"),
    '[data-section-id="python-canvas:callable:callable:child"]',
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
