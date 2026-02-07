import { describe, expect, it } from "vitest";

import { resolveEditableOnBlurRawValue } from "./editableText";

describe("resolveEditableOnBlurRawValue", () => {
  it("prefers latestValue when called with a string value", () => {
    expect(
      resolveEditableOnBlurRawValue({
        latestValue: "latest",
        eventOrValue: "stale",
      }),
    ).toBe("latest");
  });
});

