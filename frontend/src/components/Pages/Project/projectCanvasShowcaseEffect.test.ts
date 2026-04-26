import { describe, expect, it } from "vitest";
import { resolveProjectCanvasShowcaseEffectFromValues } from "./projectCanvasShowcaseEffect";

describe("resolveProjectCanvasShowcaseEffectFromValues", () => {
  it("enables the aurora effect from query parameters", () => {
    expect(
      resolveProjectCanvasShowcaseEffectFromValues({
        search: "?canvasEffect=aurora",
        storedValue: null,
      }),
    ).toBe("aurora");

    expect(
      resolveProjectCanvasShowcaseEffectFromValues({
        search: "?settaCanvasEffect",
        storedValue: null,
      }),
    ).toBe("aurora");
  });

  it("lets query parameters override stored values", () => {
    expect(
      resolveProjectCanvasShowcaseEffectFromValues({
        search: "?canvasEffect=off",
        storedValue: "aurora",
      }),
    ).toBeNull();
  });

  it("falls back to local storage when no query parameter is present", () => {
    expect(
      resolveProjectCanvasShowcaseEffectFromValues({
        search: "",
        storedValue: "true",
      }),
    ).toBe("aurora");

    expect(
      resolveProjectCanvasShowcaseEffectFromValues({
        search: "",
        storedValue: "false",
      }),
    ).toBeNull();
  });
});
