import { describe, expect, it } from "vitest";
import { assertNumericControlConfig } from "./numericControlConfig";

describe("assertNumericControlConfig", () => {
  it.each([
    [{ min: Number.NaN, max: 10, step: 1 }, "a finite min"],
    [{ min: 0, max: Number.POSITIVE_INFINITY, step: 1 }, "a finite max"],
    [{ min: 10, max: 10, step: 1 }, "min to be less than max"],
    [{ min: 0, max: 10, step: 0 }, "a finite step greater than zero"],
    [{ min: 0, max: 10, step: 11 }, "step not to exceed max minus min"],
  ])(
    "rejects the invalid public configuration %o",
    (config, expectedMessage) => {
      expect(() => assertNumericControlConfig("TestControl", config)).toThrow(
        `TestControl requires ${expectedMessage}`,
      );
    },
  );

  it("admits finite ordered bounds and a positive in-range step", () => {
    expect(() =>
      assertNumericControlConfig("TestControl", {
        min: -5,
        max: 5,
        step: 0.25,
      }),
    ).not.toThrow();
  });
});
