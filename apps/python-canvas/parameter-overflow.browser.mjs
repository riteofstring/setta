import assert from "node:assert/strict";

import {
  dragBetweenPoints,
  evaluate,
  nextAnimationFrame,
  visibleElementPoint,
  waitFor,
} from "./browser-page.mjs";

async function parameterGeometry(client, sectionSelector) {
  return evaluate(
    client,
    `(() => {
      const section = document.querySelector(${JSON.stringify(sectionSelector)});
      const surface = section.querySelector("section");
      const list = section.querySelector(".section-args-nested");
      const rows = list.querySelectorAll("[data-workspace-item-id]");
      const lastRow = rows[rows.length - 1];
      return {
        surface: surface.getBoundingClientRect().toJSON(),
        list: list.getBoundingClientRect().toJSON(),
        lastRow: lastRow.getBoundingClientRect().toJSON(),
        height: surface.offsetHeight,
        minHeight: Number.parseFloat(getComputedStyle(surface).minHeight),
        clientHeight: list.clientHeight,
        scrollHeight: list.scrollHeight,
        scrollTop: list.scrollTop,
        canvasTransform: document.querySelector(".react-flow__viewport").style.transform,
      };
    })()`,
  );
}

async function resizeHeight(client, sectionSelector, height) {
  const before = await parameterGeometry(client, sectionSelector);
  const handle = await visibleElementPoint(
    client,
    `${sectionSelector} .section-resize-handle-bottom`,
    "the parameter section height handle",
    { exactElementHit: true },
  );
  await dragBetweenPoints(client, handle, {
    x: handle.x,
    y:
      handle.y +
      ((height - before.height) * before.surface.height) / before.height,
  });
  await waitFor(
    client,
    "the parameter section height resize",
    `Math.abs(document.querySelector(${JSON.stringify(sectionSelector)}).querySelector("section").offsetHeight - ${String(height)}) <= 8`,
  );
  await nextAnimationFrame(client);
}

function assertListContained(geometry) {
  assert.ok(
    geometry.list.bottom <= geometry.surface.bottom + 1 &&
      geometry.list.top >= geometry.surface.top &&
      geometry.clientHeight > 0,
    `The parameter list escaped its card: ${JSON.stringify(geometry)}.`,
  );
}

export async function exerciseParameterOverflow(client, sectionSelector) {
  const initial = await parameterGeometry(client, sectionSelector);
  await resizeHeight(client, sectionSelector, initial.minHeight + 24);
  const compact = await parameterGeometry(client, sectionSelector);
  assertListContained(compact);
  assert.ok(
    compact.scrollHeight > compact.clientHeight,
    "The compact card must contain enough parameters to require scrolling.",
  );

  await client.send("Input.dispatchMouseEvent", {
    type: "mouseWheel",
    x: compact.list.left + compact.list.width / 2,
    y: compact.list.top + compact.list.height / 2,
    deltaX: 0,
    deltaY: compact.scrollHeight,
  });
  await waitFor(
    client,
    "the last parameter to scroll into its card",
    `(() => {
      const list = document.querySelector(${JSON.stringify(sectionSelector)}).querySelector(".section-args-nested");
      return list.scrollTop > 0 && list.scrollTop + list.clientHeight >= list.scrollHeight - 1;
    })()`,
  );
  const scrolled = await parameterGeometry(client, sectionSelector);
  assertListContained(scrolled);
  assert.ok(
    scrolled.lastRow.bottom <= scrolled.list.bottom + 1 &&
      scrolled.lastRow.top >= scrolled.list.top - 1,
    "The final parameter was not fully reachable inside the compact card.",
  );
  assert.equal(
    scrolled.canvasTransform,
    compact.canvasTransform,
    "Scrolling parameters moved the canvas.",
  );

  const expandedHeight =
    compact.height + compact.scrollHeight - compact.clientHeight + 40;
  await resizeHeight(client, sectionSelector, expandedHeight);
  const expanded = await parameterGeometry(client, sectionSelector);
  assertListContained(expanded);
  assert.ok(
    expanded.clientHeight >= expanded.scrollHeight,
    "Enlarging the card did not make room for all its parameters.",
  );
  await resizeHeight(client, sectionSelector, initial.height);
}
