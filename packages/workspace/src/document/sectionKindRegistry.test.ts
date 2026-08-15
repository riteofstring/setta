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

  it("retains a typed host Inspector contribution", () => {
    const renderInspector = () => "Inspector content";
    registerSectionKinds({ leaf: { renderContent: () => null, renderInspector } });

    expect(getRegisteredSectionKindOrThrow("leaf").renderInspector).toBe(renderInspector);
  });

  it("rejects a malformed Inspector contribution", () => {
    expect(() =>
      registerSectionKinds({
        leaf: { renderContent: () => null, renderInspector: "bad" },
      } as unknown as Record<string, SectionKindDefinition>),
    ).toThrowError(/renderInspector must be a function/);
  });

  it("retains only a callable ordinary item factory", () => {
    const createItem = () => ({ id: "item", children: [] });
    registerSectionKinds({ leaf: { renderContent: () => null, createItem } });
    expect(getRegisteredSectionKindOrThrow("leaf").createItem).toBe(createItem);

    expect(() =>
      registerSectionKinds({
        leaf: { renderContent: () => null, createItem: "bad" },
      } as unknown as Record<string, SectionKindDefinition>),
    ).toThrowError(/createItem must be a function/);
  });

  it("retains only a callable custom-item searchable-text contribution", () => {
    const getItemSearchableText = () => "search terms";
    registerSectionKinds({
      leaf: { renderContent: () => null, getItemSearchableText },
    });
    expect(getRegisteredSectionKindOrThrow("leaf").getItemSearchableText).toBe(
      getItemSearchableText,
    );

    expect(() =>
      registerSectionKinds({
        leaf: { renderContent: () => null, getItemSearchableText: "bad" },
      } as unknown as Record<string, SectionKindDefinition>),
    ).toThrowError(/getItemSearchableText must be a function/);
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
    expect(getMetaControlPresentation({ kind: "meta" })).toBe(presentation);
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

  it("rejects a competing host content slot for package-owned meta placement", () => {
    expect(() =>
      registerSectionKinds({
        meta: {
          renderContent: () => null,
          contentClassName: "host-slot",
          presentation: {
            type: "meta-control",
            resolveControlKind: () => "button",
            onEdit: () => {},
          },
        } as unknown as SectionKindDefinition,
      }),
    ).toThrowError(/cannot register a contentClassName/);
  });

  it("rejects an item factory on package-owned meta placement", () => {
    expect(() =>
      registerSectionKinds({
        meta: {
          renderContent: () => null,
          createItem: () => ({ id: "item", children: [] }),
          presentation: {
            type: "meta-control",
            resolveControlKind: () => "button",
            onEdit: () => {},
          },
        } as unknown as SectionKindDefinition,
      }),
    ).toThrowError(/cannot register createItem/);
  });

  it("rejects custom-item searchable text on package-owned meta placement", () => {
    expect(() =>
      registerSectionKinds({
        meta: {
          renderContent: () => null,
          getItemSearchableText: () => "search terms",
          presentation: {
            type: "meta-control",
            resolveControlKind: () => "button",
            onEdit: () => {},
          },
        } as unknown as SectionKindDefinition,
      }),
    ).toThrowError(/cannot register getItemSearchableText/);
  });

  it("rejects header controls on package-owned meta placement", () => {
    expect(() =>
      registerSectionKinds({
        meta: {
          renderContent: () => null,
          renderHeaderControls: () => null,
          presentation: {
            type: "meta-control",
            resolveControlKind: () => "button",
            onEdit: () => {},
          },
        } as unknown as SectionKindDefinition,
      }),
    ).toThrowError(/cannot register renderHeaderControls/);
  });

  it("rejects a non-function header control renderer", () => {
    expect(() =>
      registerSectionKinds({
        leaf: {
          renderContent: () => null,
          renderHeaderControls: "controls",
        } as unknown as SectionKindDefinition,
      }),
    ).toThrowError(/renderHeaderControls must be a function/);
  });

  it("rejects unknown presentation discriminants instead of treating them as ordinary", () => {
    expect(() =>
      registerSectionKinds({
        mystery: {
          renderContent: () => null,
          presentation: { type: "floating" },
        } as unknown as SectionKindDefinition,
      }),
    ).toThrowError(/Section kind mystery has unknown presentation type floating/);
  });

  it("rejects missing meta-control callbacks during registration", () => {
    expect(() =>
      registerSectionKinds({
        meta: {
          renderContent: () => null,
          presentation: { type: "meta-control", onEdit: () => {} },
        } as unknown as SectionKindDefinition,
      }),
    ).toThrowError(/must provide resolveControlKind/);
  });
});
