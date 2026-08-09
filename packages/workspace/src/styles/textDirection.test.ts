/* @vitest-environment jsdom */

import { afterEach, describe, expect, it } from "vitest";
import { getElementTextDirection, getInlineDirectionSign } from "./textDirection";

afterEach(() => {
  document.documentElement.removeAttribute("dir");
  document.body.replaceChildren();
});

describe("workspace text direction", () => {
  it("uses the nearest explicit direction for nested workspace content", () => {
    const rtlHost = document.createElement("div");
    rtlHost.dir = "rtl";
    const control = document.createElement("button");
    rtlHost.appendChild(control);
    document.body.appendChild(rtlHost);

    expect(getElementTextDirection(control)).toBe("rtl");
    expect(getInlineDirectionSign(control)).toBe(-1);
  });

  it("inherits the document direction and otherwise uses the CSS initial ltr direction", () => {
    const control = document.createElement("button");
    document.body.appendChild(control);

    expect(getElementTextDirection(control)).toBe("ltr");
    expect(getInlineDirectionSign(control)).toBe(1);

    document.documentElement.dir = "rtl";
    expect(getElementTextDirection(control)).toBe("rtl");
  });
});
