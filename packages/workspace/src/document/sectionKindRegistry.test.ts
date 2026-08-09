import { afterEach, describe, expect, it } from "vitest";
import { GROUP_SECTION_KIND } from "./documentSelectors";
import {
  getRegisteredSectionKindOrThrow,
  registerSectionKinds,
  type SectionKindDefinition,
} from "./sectionKindRegistry";

function makeDefinition(): SectionKindDefinition {
  return { renderContent: () => null };
}

describe("sectionKindRegistry", () => {
  afterEach(() => {
    registerSectionKinds({});
  });

  it("returns the registered definition for a kind", () => {
    const leaf = makeDefinition();
    registerSectionKinds({ leaf });
    expect(getRegisteredSectionKindOrThrow("leaf")).toBe(leaf);
  });

  it("throws for an unregistered kind, naming it", () => {
    registerSectionKinds({ leaf: makeDefinition() });
    expect(() => getRegisteredSectionKindOrThrow("mystery")).toThrowError(
      /Section kind mystery is not registered/,
    );
  });

  it("replaces the whole registered set on re-registration", () => {
    registerSectionKinds({ leaf: makeDefinition() });
    registerSectionKinds({ note: makeDefinition() });
    expect(getRegisteredSectionKindOrThrow("note")).toBeDefined();
    expect(() => getRegisteredSectionKindOrThrow("leaf")).toThrowError(/not registered/);
  });

  it("refuses to register the package-owned group kind", () => {
    expect(() => registerSectionKinds({ [GROUP_SECTION_KIND]: makeDefinition() })).toThrowError(
      /package-owned/,
    );
  });
});
