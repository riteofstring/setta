import { afterEach, describe, expect, it } from "vitest";
import { GROUP_SECTION_KIND } from "./documentSelectors";
import {
  getMetaControlPresentation,
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

  it("returns the registered direct-on-canvas presentation for a meta section", () => {
    const presentation = {
      type: "meta-control" as const,
      resolveControlKind: () => "text" as const,
      onEdit: () => {},
    };
    registerSectionKinds({
      meta: { renderContent: () => null, presentation },
    });
    expect(
      getMetaControlPresentation({
        id: "meta-text",
        kind: "meta",
        name: "Text",
        size: { width: 200, height: 44 },
        isMinimized: false,
        positionAndSizeLocked: false,
        isHorizontalOrientation: false,
        styleColor: null,
        tagColor: null,
        children: [],
      }),
    ).toBe(presentation);
  });

  it("rejects a competing host default for package-owned meta geometry", () => {
    expect(() =>
      registerSectionKinds({
        meta: {
          renderContent: () => null,
          defaultSize: { width: 900, height: 600 },
          presentation: {
            type: "meta-control",
            resolveControlKind: () => "button",
            onEdit: () => {},
          },
        } as unknown as SectionKindDefinition,
      }),
    ).toThrowError(/cannot register a defaultSize/);
  });
});
