import { describe, expect, it } from "vitest";

import { createRealtimeSectionKinds } from "./realtimeSectionKinds";

describe("realtime section registry", () => {
  it("declares the complete generated-contract kind set", () => {
    const catalog = createRealtimeSectionKinds();

    expect(Object.keys(catalog).sort()).toEqual([
      "button",
      "drawing",
      "input",
      "output",
      "status",
    ]);
    expect(
      Object.values(catalog).every(
        (definition) => definition.nestedSections === "vertical",
      ),
    ).toBe(true);
  });
});
