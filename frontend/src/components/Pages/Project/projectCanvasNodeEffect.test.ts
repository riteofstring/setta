import { describe, expect, it } from "vitest";
import { resolveProjectCanvasNodeEffectFromValues } from "./projectCanvasNodeEffect";

describe("project canvas node effect resolution", () => {
  it("enables cloth from the shared canvas effect query parameter", () => {
    expect(
      resolveProjectCanvasNodeEffectFromValues({
        search: "?canvasEffect=cloth",
      }),
    ).toBe("cloth");
  });

  it("enables cloth from the node-specific query parameter without a value", () => {
    expect(
      resolveProjectCanvasNodeEffectFromValues({
        search: "?canvasNodeEffect",
      }),
    ).toBe("cloth");
  });

  it("lets an off query parameter override stored cloth settings", () => {
    expect(
      resolveProjectCanvasNodeEffectFromValues({
        search: "?canvasNodeEffect=off",
        storedValue: "cloth",
      }),
    ).toBeUndefined();
  });

  it("falls back to stored node effect settings", () => {
    expect(
      resolveProjectCanvasNodeEffectFromValues({
        search: "",
        storedValue: "wind",
      }),
    ).toBe("cloth");
  });
});
