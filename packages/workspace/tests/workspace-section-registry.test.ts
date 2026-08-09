import { describe, expect, it } from "vitest";

import type { WorkspaceDocument, WorkspaceSection } from "../src/core.js";
import type { SectionDefinition } from "../src/internal/workspace-section-contract.js";
import {
  resolveSectionDefinitions,
  validateWorkspaceSectionDefinitions,
} from "../src/internal/workspace-section-registry.js";
import { createWorkspaceTestDocument } from "../src/testing.js";

const EmptyRenderer = () => null;

function definition(overrides: Partial<SectionDefinition> = {}): SectionDefinition {
  return {
    defaultSize: { height: 180, width: 240 },
    displayName: "Test section",
    kind: "test",
    render: EmptyRenderer,
    ...overrides,
  };
}

function documentWithSection(
  update: (section: WorkspaceSection) => WorkspaceSection,
): WorkspaceDocument {
  const document = createWorkspaceTestDocument([{ id: "alpha", title: "Alpha" }]);
  const section = document.sections.alpha as WorkspaceSection;
  return {
    ...document,
    sections: { ...document.sections, alpha: update(section) },
  };
}

describe("workspace section registry", () => {
  it("resolves deterministic sizing, presentation, containment, and creation defaults", () => {
    const registry = resolveSectionDefinitions([definition()]);

    expect(registry.definition("test")).toMatchObject({
      canContainSections: false,
      chrome: "default",
      contentSizing: { height: true, width: true },
      creation: { group: null, icon: null, keywords: [] },
      defaultChildOrientation: "vertical",
      defaultChildOverflow: "grow",
      defaultSize: { height: 180, width: 240 },
      defaultSizeMode: { height: "fixed", width: "fixed" },
      defaultTitle: "Test section",
      detachable: false,
      displayName: "Test section",
      kind: "test",
      minimizable: true,
      resize: {
        axes: "both",
        maxSize: {},
        minSize: {},
        preserveAspectRatio: false,
      },
    });
  });

  it("retains explicit metadata for creation and constrained container defaults", () => {
    const registry = resolveSectionDefinitions([
      definition({
        canContainSections: true,
        chrome: "compact",
        contentSizing: { height: false, width: true },
        creation: { group: "Layout", icon: "C", keywords: ["group", "stack"] },
        defaultChildOrientation: "horizontal",
        defaultChildOverflow: "scroll",
        defaultSize: { height: 200, width: 320 },
        defaultSizeMode: { height: "fixed", width: "content" },
        defaultTitle: "Container",
        detachable: true,
        minimizable: false,
        resize: {
          axes: "horizontal",
          maxSize: { width: 640 },
          minSize: { height: 160, width: 280 },
          preserveAspectRatio: true,
        },
      }),
    ]);

    expect(registry.definition("test")).toMatchObject({
      canContainSections: true,
      chrome: "compact",
      creation: { group: "Layout", icon: "C", keywords: ["group", "stack"] },
      defaultChildOrientation: "horizontal",
      defaultChildOverflow: "scroll",
      defaultSizeMode: { height: "fixed", width: "content" },
      defaultTitle: "Container",
      detachable: true,
      minimizable: false,
      resize: {
        axes: "horizontal",
        maxSize: { width: 640 },
        minSize: { height: 160, width: 280 },
        preserveAspectRatio: true,
      },
    });
  });

  it("rejects ambiguous or malformed definitions before rendering", () => {
    expect(() => resolveSectionDefinitions([definition(), definition()])).toThrow(
      'Duplicate section definition kind "test"',
    );
    expect(() =>
      resolveSectionDefinitions([
        definition({
          defaultSizeMode: { height: "fixed", width: "content" },
          contentSizing: { height: true, width: false },
        }),
      ]),
    ).toThrow("cannot default width to content sizing");
    expect(() =>
      resolveSectionDefinitions([
        definition({ contentSizing: { height: true } as { height: boolean; width: boolean } }),
      ]),
    ).toThrow("contentSizing width must be a boolean");
    expect(() =>
      resolveSectionDefinitions([
        definition({ resize: { axes: "both", maxSize: { width: 200 }, minSize: { width: 260 } } }),
      ]),
    ).toThrow("width minimum cannot exceed its maximum");
    expect(() =>
      resolveSectionDefinitions([definition({ defaultChildOrientation: "horizontal" })]),
    ).toThrow("cannot declare child-layout defaults");
    expect(() =>
      resolveSectionDefinitions([definition({ creation: { keywords: ["note", "note"] } })]),
    ).toThrow("keywords must not contain duplicates");
    expect(() =>
      resolveSectionDefinitions([definition({ detachable: "yes" as unknown as boolean })]),
    ).toThrow("detachable must be a boolean");

    const sparse = new Array<SectionDefinition>(1);
    expect(() => resolveSectionDefinitions(sparse)).toThrow(
      "Workspace section definitions must be a dense array without extra fields",
    );
  });

  it("rejects accessor-backed definition fields without evaluating them", () => {
    const candidate = definition() as Record<string, unknown>;
    Object.defineProperty(candidate, "displayName", {
      enumerable: true,
      get: () => {
        throw new Error("The section definition getter must not run.");
      },
    });

    expect(() => resolveSectionDefinitions([candidate as unknown as SectionDefinition])).toThrow(
      "section definition field displayName",
    );
  });
});

describe("workspace document section-definition compatibility", () => {
  it("accepts registered sections whose persisted state satisfies the definition", () => {
    const document = createWorkspaceTestDocument([{ id: "alpha", title: "Alpha" }]);
    const registry = resolveSectionDefinitions([
      definition({ resize: { axes: "both", minSize: { height: 100, width: 200 } } }),
    ]);

    expect(() => validateWorkspaceSectionDefinitions(document, registry)).not.toThrow();
  });

  it("rejects unknown kinds and incompatible persisted state specifically", () => {
    const document = createWorkspaceTestDocument([{ id: "alpha", title: "Alpha" }]);
    expect(() =>
      validateWorkspaceSectionDefinitions(document, resolveSectionDefinitions([])),
    ).toThrow('section "alpha" uses unregistered kind "test"');

    const unsupportedContent = documentWithSection((section) => ({
      ...section,
      size: { ...section.size, width: { mode: "content", value: 240 } },
    }));
    expect(() =>
      validateWorkspaceSectionDefinitions(
        unsupportedContent,
        resolveSectionDefinitions([definition({ contentSizing: { height: true, width: false } })]),
      ),
    ).toThrow("uses unsupported content sizing on width");

    const minimized = documentWithSection((section) => ({ ...section, isMinimized: true }));
    expect(() =>
      validateWorkspaceSectionDefinitions(
        minimized,
        resolveSectionDefinitions([definition({ minimizable: false })]),
      ),
    ).toThrow("is minimized but its registered definition is not minimizable");

    const container = documentWithSection((section) => ({
      ...section,
      childLayout: {
        orientation: "vertical",
        overflow: "grow",
        positioning: "ordered",
        sectionIds: [],
      },
    }));
    expect(() =>
      validateWorkspaceSectionDefinitions(container, resolveSectionDefinitions([definition()])),
    ).toThrow("has children but its registered definition cannot contain sections");

    expect(() =>
      validateWorkspaceSectionDefinitions(
        document,
        resolveSectionDefinitions([
          definition({
            resize: { axes: "both", minSize: { width: 260 } },
            defaultSize: { height: 180, width: 280 },
          }),
        ]),
      ),
    ).toThrow("width is below its registered minimum");
  });
});
