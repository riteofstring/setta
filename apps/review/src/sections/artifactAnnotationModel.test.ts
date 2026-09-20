import { describe, expect, it } from "vitest";

import { containedImageBounds } from "./artifactAnnotationModel";

describe("artifact annotation model", () => {
  const bounds = {
    height: 100,
    left: 10,
    top: 20,
    width: 200,
  };

  it("fits the annotation bounds to contained image pixels", () => {
    expect(containedImageBounds(bounds, 1_600, 800)).toEqual({
      height: 100,
      left: 10,
      top: 20,
      width: 200,
    });
    expect(containedImageBounds(bounds, 100, 100)).toEqual({
      height: 100,
      left: 60,
      top: 20,
      width: 100,
    });
    expect(containedImageBounds(bounds, 0, 100)).toBeNull();
  });
});
