import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createWorkspaceHost, type WorkspaceHost } from "../workspaceHost";
import { GROUP_SECTION_KIND } from "./documentSelectors";
import {
  canWorkspaceSectionOwnNestedSections,
  getMetaControlPresentation,
  getRegisteredSectionKindOrThrow,
  getWorkspaceItemAreaPresentationOrThrow,
  registerSectionKinds,
  type SectionKindDefinition,
} from "./sectionKindRegistry";

function makeDefinition(): SectionKindDefinition {
  return { renderContent: () => null };
}

describe("sectionKindRegistry", () => {
  let host: WorkspaceHost;

  beforeEach(() => {
    host = createWorkspaceHost();
  });

  afterEach(() => {
    host.dispose();
  });

  it("returns the registered definition for a kind", () => {
    const leaf = makeDefinition();
    registerSectionKinds(host, { leaf });
    expect(getRegisteredSectionKindOrThrow(host, "leaf")).toBe(leaf);
  });

  it("retains a complete ordinary registered-kind sizing declaration", () => {
    const sizeConstraints = {
      minHeight: 50,
      maxHeight: 50,
      minWidth: 200,
      maxWidth: 100_000,
    };
    registerSectionKinds(host, {
      list: { renderContent: () => null, sizeConstraints },
    });

    expect(
      getRegisteredSectionKindOrThrow(host, "list").sizeConstraints,
    ).toEqual(sizeConstraints);
  });

  it("rejects incomplete, invalid, and contradictory sizing declarations at registration", () => {
    expect(() =>
      registerSectionKinds(host, {
        incomplete: {
          renderContent: () => null,
          sizeConstraints: {
            minHeight: 0,
            maxHeight: 100,
            minWidth: 200,
          },
        } as unknown as SectionKindDefinition,
      }),
    ).toThrowError(/maxWidth must be a finite non-negative number/);
    expect(() =>
      registerSectionKinds(host, {
        invalid: {
          renderContent: () => null,
          sizeConstraints: {
            minHeight: 0,
            maxHeight: Number.POSITIVE_INFINITY,
            minWidth: 200,
            maxWidth: 100_000,
          },
        } as unknown as SectionKindDefinition,
      }),
    ).toThrowError(/maxHeight must be a finite non-negative number/);
    expect(() =>
      registerSectionKinds(host, {
        contradictory: {
          renderContent: () => null,
          sizeConstraints: {
            minHeight: 80,
            maxHeight: 50,
            minWidth: 200,
            maxWidth: 100_000,
          },
        },
      }),
    ).toThrowError(/contradictory minimum and maximum/);
    expect(() =>
      registerSectionKinds(host, {
        outsideSafetyEnvelope: {
          renderContent: () => null,
          sizeConstraints: {
            minHeight: 0,
            maxHeight: 100_000,
            minWidth: 0,
            maxWidth: 199,
          },
        },
      }),
    ).toThrowError(/contradict the workspace safety bounds/);
  });

  it("retains a typed host Inspector contribution", () => {
    const renderInspector = () => "Inspector content";
    registerSectionKinds(host, {
      leaf: { renderContent: () => null, renderInspector },
    });

    expect(getRegisteredSectionKindOrThrow(host, "leaf").renderInspector).toBe(
      renderInspector,
    );
  });

  it("rejects a malformed Inspector contribution", () => {
    expect(() =>
      registerSectionKinds(host, {
        leaf: { renderContent: () => null, renderInspector: "bad" },
      } as unknown as Record<string, SectionKindDefinition>),
    ).toThrowError(/renderInspector must be a function/);
  });

  it("retains only a callable ordinary item factory", () => {
    const createItem = () => ({ id: "item", children: [] });
    registerSectionKinds(host, {
      leaf: { renderContent: () => null, createItem },
    });
    expect(getRegisteredSectionKindOrThrow(host, "leaf").createItem).toBe(
      createItem,
    );

    expect(() =>
      registerSectionKinds(host, {
        leaf: { renderContent: () => null, createItem: "bad" },
      } as unknown as Record<string, SectionKindDefinition>),
    ).toThrowError(/createItem must be a function/);
  });

  it("retains only a callable custom-item searchable-text contribution", () => {
    const getItemSearchableText = () => "search terms";
    registerSectionKinds(host, {
      leaf: { renderContent: () => null, getItemSearchableText },
    });
    expect(
      getRegisteredSectionKindOrThrow(host, "leaf").getItemSearchableText,
    ).toBe(getItemSearchableText);

    expect(() =>
      registerSectionKinds(host, {
        leaf: { renderContent: () => null, getItemSearchableText: "bad" },
      } as unknown as Record<string, SectionKindDefinition>),
    ).toThrowError(/getItemSearchableText must be a function/);
  });

  it("throws for an unregistered kind, naming it", () => {
    registerSectionKinds(host, { leaf: makeDefinition() });
    expect(() => getRegisteredSectionKindOrThrow(host, "mystery")).toThrowError(
      /Section kind mystery is not registered/,
    );
  });

  it("replaces the whole registered set on re-registration", () => {
    registerSectionKinds(host, { leaf: makeDefinition() });
    registerSectionKinds(host, { note: makeDefinition() });
    expect(getRegisteredSectionKindOrThrow(host, "note")).toBeDefined();
    expect(() => getRegisteredSectionKindOrThrow(host, "leaf")).toThrowError(
      /not registered/,
    );
  });

  it("refuses to register the package-owned group kind", () => {
    expect(() =>
      registerSectionKinds(host, { [GROUP_SECTION_KIND]: makeDefinition() }),
    ).toThrowError(/package-owned/);
  });

  it("recognizes the package group and a declared ordinary vertical container", () => {
    registerSectionKinds(host, {
      leaf: makeDefinition(),
      list: { renderContent: () => null, nestedSections: "vertical" },
    });

    expect(
      canWorkspaceSectionOwnNestedSections(host, {
        kind: GROUP_SECTION_KIND,
      }),
    ).toBe(true);
    expect(canWorkspaceSectionOwnNestedSections(host, { kind: "list" })).toBe(
      true,
    );
    expect(canWorkspaceSectionOwnNestedSections(host, { kind: "leaf" })).toBe(
      false,
    );
  });

  it("rejects an unknown ordinary nested-sections presentation", () => {
    expect(() =>
      registerSectionKinds(host, {
        list: {
          renderContent: () => null,
          nestedSections: "horizontal",
        } as unknown as SectionKindDefinition,
      }),
    ).toThrowError(/unknown nested-sections presentation horizontal/);
  });

  it("returns the registered direct-on-canvas presentation for a meta section", () => {
    const presentation = {
      type: "meta-control" as const,
      resolveControlKind: () => "text" as const,
      onEdit: () => {},
    };
    registerSectionKinds(host, {
      meta: { renderContent: () => null, presentation },
    });
    expect(getMetaControlPresentation(host, { kind: "meta" })).toBe(
      presentation,
    );
  });

  it("rejects a competing host default for package-owned meta geometry", () => {
    expect(() =>
      registerSectionKinds(host, {
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

  it("rejects registered size constraints for package-owned meta geometry", () => {
    expect(() =>
      registerSectionKinds(host, {
        meta: {
          renderContent: () => null,
          sizeConstraints: {
            minHeight: 50,
            maxHeight: 50,
            minWidth: 200,
            maxWidth: 100_000,
          },
          presentation: {
            type: "meta-control",
            resolveControlKind: () => "button",
            onEdit: () => {},
          },
        } as unknown as SectionKindDefinition,
      }),
    ).toThrowError(/cannot register size constraints/);
  });

  it("rejects a competing host content slot for package-owned meta placement", () => {
    expect(() =>
      registerSectionKinds(host, {
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
      registerSectionKinds(host, {
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
      registerSectionKinds(host, {
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
      registerSectionKinds(host, {
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

  it("rejects nested sections on package-owned meta placement", () => {
    expect(() =>
      registerSectionKinds(host, {
        meta: {
          renderContent: () => null,
          nestedSections: "vertical",
          presentation: {
            type: "meta-control",
            resolveControlKind: () => "button",
            onEdit: () => {},
          },
        } as unknown as SectionKindDefinition,
      }),
    ).toThrowError(/meta controls cannot own section children/);
  });

  it("rejects a non-function header control renderer", () => {
    expect(() =>
      registerSectionKinds(host, {
        leaf: {
          renderContent: () => null,
          renderHeaderControls: "controls",
        } as unknown as SectionKindDefinition,
      }),
    ).toThrowError(/renderHeaderControls must be a function/);
  });

  it("rejects unknown presentation discriminants instead of treating them as ordinary", () => {
    expect(() =>
      registerSectionKinds(host, {
        mystery: {
          renderContent: () => null,
          presentation: { type: "floating" },
        } as unknown as SectionKindDefinition,
      }),
    ).toThrowError(
      /Section kind mystery has unknown presentation type floating/,
    );
  });

  it("rejects missing meta-control callbacks during registration", () => {
    expect(() =>
      registerSectionKinds(host, {
        meta: {
          renderContent: () => null,
          presentation: { type: "meta-control", onEdit: () => {} },
        } as unknown as SectionKindDefinition,
      }),
    ).toThrowError(/must provide resolveControlKind/);
  });

  it("retains a declared item-area presentation and its leading content", () => {
    const renderLeadingContent = () => "leading control";
    registerSectionKinds(host, {
      items: {
        renderContent: () => null,
        itemArea: { renderLeadingContent, toolbar: "filter-only" },
      },
    });

    const itemArea = getWorkspaceItemAreaPresentationOrThrow(host, {
      id: "panel",
      kind: "items",
    });
    expect(itemArea.toolbar).toBe("filter-only");
    expect(itemArea.renderLeadingContent).toBe(renderLeadingContent);
  });

  it("names the kind when an item-carrying section has no declared item area", () => {
    registerSectionKinds(host, { items: makeDefinition() });

    expect(() =>
      getWorkspaceItemAreaPresentationOrThrow(host, {
        id: "panel",
        kind: "items",
      }),
    ).toThrowError(
      /Section panel carries an item tree, but section kind items does not declare an item-area presentation/,
    );
  });

  it("names the meta-control constraint when such a section carries items", () => {
    registerSectionKinds(host, {
      meta: {
        renderContent: () => null,
        presentation: {
          type: "meta-control",
          resolveControlKind: () => "button",
          onEdit: () => {},
        },
      },
    });

    expect(() =>
      getWorkspaceItemAreaPresentationOrThrow(host, {
        id: "panel",
        kind: "meta",
      }),
    ).toThrowError(/meta controls cannot carry item trees/);
  });

  it("rejects an item-area presentation on package-owned meta placement", () => {
    expect(() =>
      registerSectionKinds(host, {
        meta: {
          renderContent: () => null,
          itemArea: { toolbar: "hidden" },
          presentation: {
            type: "meta-control",
            resolveControlKind: () => "button",
            onEdit: () => {},
          },
        } as unknown as SectionKindDefinition,
      }),
    ).toThrowError(/cannot register an item-area presentation/);
  });

  it("rejects an unknown toolbar mode instead of choosing a plausible one", () => {
    expect(() =>
      registerSectionKinds(host, {
        items: {
          renderContent: () => null,
          itemArea: { toolbar: "read-only" },
        } as unknown as SectionKindDefinition,
      }),
    ).toThrowError(
      /Section kind items declares the unknown item toolbar mode read-only/,
    );
  });

  it("rejects a non-function leading-content renderer", () => {
    expect(() =>
      registerSectionKinds(host, {
        items: {
          renderContent: () => null,
          itemArea: {
            renderLeadingContent: "leading control",
            toolbar: "filter-only",
          },
        } as unknown as SectionKindDefinition,
      }),
    ).toThrowError(/renderLeadingContent must be a function/);
  });
});
