import { describe, expect, test } from "vitest";

import { constrainSectionHeight } from "./sidebar-accordion";

describe("sidebar accordion sizing", () => {
  test("caps resized sections to the rendered content height", () => {
    expect(constrainSectionHeight(300, 120)).toBe(120);
    expect(constrainSectionHeight(900, 800)).toBe(520);
  });

  test("does not force minimum whitespace when content is shorter than the minimum", () => {
    expect(constrainSectionHeight(80, 24)).toBe(24);
  });

  test("keeps a usable minimum when content can scroll", () => {
    expect(constrainSectionHeight(10, 120)).toBe(40);
  });
});
