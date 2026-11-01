/* @vitest-environment jsdom */

import { afterEach, describe, expect, it } from "vitest";
import { computeItemNameErrorBubblePosition } from "./ItemNameErrorBubble.js";

const SECTION_ID = "section";
const CONTAINER_ID = `${SECTION_ID}-CustomResizable`;
const LIVE_ID = "live-editor";
const DUMMY_ID = "dummy-editor";

function rect(values: Partial<DOMRect>): DOMRect {
  return {
    bottom: 0,
    height: 0,
    left: 0,
    right: 0,
    top: 0,
    width: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
    ...values,
  };
}

function setupPositioningFixture(direction: "ltr" | "rtl") {
  const container = document.createElement("section");
  container.id = CONTAINER_ID;
  container.dir = direction;
  Object.defineProperties(container, {
    offsetHeight: { value: 100 },
    offsetWidth: { value: 200 },
  });
  container.getBoundingClientRect = () =>
    rect({
      left: 100,
      right: 500,
      top: 40,
      bottom: 240,
      width: 400,
      height: 200,
    });

  const anchor = document.createElement("div");
  anchor.id = LIVE_ID;
  anchor.getBoundingClientRect = () =>
    rect({
      left: 140,
      right: 220,
      top: 80,
      bottom: 100,
      width: 80,
      height: 20,
    });
  container.appendChild(anchor);
  document.body.appendChild(container);

  const bubble = document.createElement("div");
  bubble.getBoundingClientRect = () => rect({ width: 100, height: 40 });
  return bubble;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("item-name error bubble direction", () => {
  it("aligns from the leading edge in ltr", () => {
    const bubble = setupPositioningFixture("ltr");

    expect(
      computeItemNameErrorBubblePosition(
        CONTAINER_ID,
        LIVE_ID,
        DUMMY_ID,
        bubble,
      ),
    ).toEqual({
      left: 20,
      top: 36,
      visible: true,
    });
  });

  it("aligns from the trailing anchor edge in rtl", () => {
    const bubble = setupPositioningFixture("rtl");

    expect(
      computeItemNameErrorBubblePosition(
        CONTAINER_ID,
        LIVE_ID,
        DUMMY_ID,
        bubble,
      ),
    ).toEqual({
      left: 10,
      top: 36,
      visible: true,
    });
  });
});
