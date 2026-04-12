import { describe, expect, it } from "vitest";
import { isNodeDragInteractionEnabled } from "./useDrag";

describe("isNodeDragInteractionEnabled", () => {
  it("disables node dragging while pan activation is pressed", () => {
    expect(
      isNodeDragInteractionEnabled({
        disabled: false,
        panActivationKeyPressed: true,
      }),
    ).toBe(false);
  });

  it("keeps drag disabled for locked nodes even without pan activation", () => {
    expect(
      isNodeDragInteractionEnabled({
        disabled: true,
        panActivationKeyPressed: false,
      }),
    ).toBe(false);
  });

  it("allows node dragging only when both guards are clear", () => {
    expect(
      isNodeDragInteractionEnabled({
        disabled: false,
        panActivationKeyPressed: false,
      }),
    ).toBe(true);
  });
});
