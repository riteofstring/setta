import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { isEditableEscapeTarget } from "./gitOverlayLayerUtils";

type HTMLElementLikeCtor = new (...args: unknown[]) => object;

class FakeHTMLElement {
  isContentEditable = false;
  closestResult: object | null = null;

  closest(): object | null {
    return this.closestResult;
  }
}

function setHTMLElementCtor(ctor: HTMLElementLikeCtor | undefined): void {
  Object.defineProperty(globalThis, "HTMLElement", {
    value: ctor,
    writable: true,
    configurable: true,
  });
}

describe("isEditableEscapeTarget", () => {
  const originalHTMLElement = (
    globalThis as { HTMLElement?: HTMLElementLikeCtor }
  ).HTMLElement;

  beforeEach(() => {
    setHTMLElementCtor(FakeHTMLElement);
  });

  afterEach(() => {
    setHTMLElementCtor(originalHTMLElement);
  });

  it("returns true for contentEditable targets", () => {
    const target = new FakeHTMLElement();
    target.isContentEditable = true;

    expect(isEditableEscapeTarget(target as unknown as EventTarget)).toBe(true);
  });

  it("returns true for targets inside editable form controls", () => {
    const target = new FakeHTMLElement();
    target.closestResult = {};

    expect(isEditableEscapeTarget(target as unknown as EventTarget)).toBe(true);
  });

  it("returns false for non-editable targets", () => {
    const target = new FakeHTMLElement();

    expect(isEditableEscapeTarget(target as unknown as EventTarget)).toBe(
      false,
    );
  });

  it("returns false when HTMLElement is unavailable", () => {
    setHTMLElementCtor(undefined);

    expect(isEditableEscapeTarget(null)).toBe(false);
  });
});
