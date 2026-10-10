import assert from "node:assert/strict";

import {
  clickElementCenter,
  dragBetweenPoints,
  evaluate,
  visibleElementPoint,
  waitFor,
} from "./browser-page.mjs";

async function sectionGeometry(client, selectors) {
  return evaluate(
    client,
    `${JSON.stringify(selectors)}.map((selector) => {
      const surface = document.querySelector(selector).querySelector("section");
      return {
        width: surface.offsetWidth,
        height: surface.offsetHeight,
        renderedWidth: surface.getBoundingClientRect().width,
      };
    })`,
  );
}

async function dragWidth(client, selector, delta) {
  const [before] = await sectionGeometry(client, [selector]);
  const handle = await visibleElementPoint(
    client,
    `${selector} .section-resize-handle-right`,
    "the section width resize handle",
    { exactElementHit: true },
  );
  await dragBetweenPoints(client, handle, {
    x: handle.x + (delta * before.renderedWidth) / before.width,
    y: handle.y,
  });
}

async function waitForMatchingWidths(
  client,
  selectors,
  resizedIndex,
  beforeWidth,
) {
  await waitFor(
    client,
    "the root and every child to share the resized width",
    `(() => {
      const widths = ${JSON.stringify(selectors)}.map((selector) =>
        document.querySelector(selector).querySelector("section").offsetWidth);
      return Math.abs(widths[${String(resizedIndex)}] - ${String(beforeWidth)}) >= 60 &&
        widths.every((width) => width === widths[${String(resizedIndex)}]);
    })()`,
  );
}

async function resizeSharedSectionWidths(client, selectors) {
  const initial = await sectionGeometry(client, selectors);
  await dragWidth(client, selectors[1], 90);
  await waitForMatchingWidths(client, selectors, 1, initial[1].width);
  const afterChild = await sectionGeometry(client, selectors);
  assert.deepEqual(
    afterChild.map(({ height }) => height),
    initial.map(({ height }) => height),
    "Changing a child's width changed section heights.",
  );

  await dragWidth(client, selectors[0], initial[1].width - afterChild[0].width);
  await waitForMatchingWidths(client, selectors, 0, afterChild[0].width);
  const afterRoot = await sectionGeometry(client, selectors);
  assert.ok(
    Math.abs(afterRoot[0].width - initial[1].width) <= 1,
    "Resizing the root did not restore the original child width.",
  );
  assert.deepEqual(
    afterRoot.map(({ height }) => height),
    initial.map(({ height }) => height),
    "Changing the root's width changed section heights.",
  );
}

export async function exerciseSharedSectionWidths(client, selectors) {
  const snapToggle = '[aria-label="toggle snap to grid"]';
  const wasSnapping = await evaluate(
    client,
    `document.querySelector(${JSON.stringify(snapToggle)}).getAttribute("aria-pressed") === "true"`,
  );
  if (wasSnapping) {
    await clickElementCenter(client, snapToggle, "disable grid snapping");
  }
  try {
    await resizeSharedSectionWidths(client, selectors);
  } finally {
    if (wasSnapping) {
      await clickElementCenter(client, snapToggle, "restore grid snapping");
    }
  }
}
