import { describe, expect, it } from "vitest";
import { WORKSPACE_CODE_SECTION_KIND } from "@riteofstring/setta";

import { createRealtimeSectionKinds } from "./realtimeSectionKinds";

describe("realtime section registry", () => {
  it("declares the complete generated-contract kind set", () => {
    const catalog = createRealtimeSectionKinds();

    expect(Object.keys(catalog).sort()).toEqual([
      "button",
      "drawing",
      "handler",
      "input",
      "output",
      WORKSPACE_CODE_SECTION_KIND,
      "status",
    ]);
    const runtimeKinds = [
      "button",
      "drawing",
      "handler",
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

  it("strictly validates app-owned handler section data", () => {
    const definition = createRealtimeSectionKinds().handler;
    const section = {
      data: { bindingId: "binding-main" },
    } as unknown as Parameters<
      NonNullable<typeof definition.assertValidData>
    >[0];

    expect(() => definition.assertValidData?.(section)).not.toThrow();
    expect(() =>
      definition.assertValidData?.({
        ...section,
        data: { bindingId: "binding-main", extra: true },
      }),
    ).toThrow(/exactly one non-empty bindingId/);
    expect(() =>
      definition.assertValidData?.({ ...section, data: { bindingId: "" } }),
    ).toThrow(/exactly one non-empty bindingId/);
  });
});
