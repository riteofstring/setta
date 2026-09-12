import { describe, expect, it } from "vitest";
import { WORKSPACE_CODE_SECTION_KIND } from "@setta/workspace";

import { createRealtimeSectionKinds } from "./realtimeSectionKinds";

describe("realtime section registry", () => {
  it("declares the complete generated-contract kind set", () => {
    const catalog = createRealtimeSectionKinds();

    expect(Object.keys(catalog).sort()).toEqual([
      "button",
      "drawing",
      "input",
      "output",
      WORKSPACE_CODE_SECTION_KIND,
      "status",
    ]);
    const runtimeKinds = [
      "button",
      "drawing",
      "input",
      "output",
      "status",
    ] as const;
    expect(
      runtimeKinds.every(
        (kind) => catalog[kind]!.nestedSections === "vertical",
      ),
    ).toBe(true);
    expect(catalog[WORKSPACE_CODE_SECTION_KIND].nestedSections).toBeUndefined();
  });
});
