import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getWorkspaceDocumentStore } from "../document/stores";
import {
  registerSectionKinds,
  type SectionKindDefinition,
} from "../document/sectionKindRegistry";
import type {
  TopLevelSectionLayout,
  WorkspaceItem,
  WorkspaceSection,
  WorkspaceSectionItemTree,
} from "../document/types";
import { createWorkspaceHost, type WorkspaceHost } from "../workspaceHost";
import {
  buildWorkspaceFindResults,
  resolveWorkspaceFindResults,
} from "./workspaceFind";

let host: WorkspaceHost;

function createSection({
  children = [],
  data,
  id,
  itemTree,
  kind,
  name,
}: {
  children?: Array<string>;
  data?: WorkspaceSection["data"];
  id: string;
  itemTree?: WorkspaceSectionItemTree;
  kind: string;
  name: string;
}): WorkspaceSection {
  return {
    children,
    ...(data === undefined ? {} : { data }),
    id,
    isHorizontalOrientation: false,
    isMinimized: false,
    kind,
    name,
    overflowMode: false,
    positionAndSizeLocked: false,
    size: { height: 120, width: 240 },
    styleColor: null,
    tagColor: null,
    ...(itemTree === undefined ? {} : { itemTree }),
  };
}

function createBuiltInItem(
  id: string,
  label: string,
  children: Array<string> = [],
): WorkspaceItem {
  return {
    children,
    id,
    presentation: {
      control: { kind: "group" },
      label,
      labelEditable: true,
    },
  };
}

function installDocument({
  parentSectionMap,
  sections,
  topLevelSectionIds,
}: {
  parentSectionMap: Record<string, string>;
  sections: Record<string, WorkspaceSection>;
  topLevelSectionIds: Array<string>;
}): void {
  const topLevelSections: Record<string, TopLevelSectionLayout> = {};
  for (const [index, sectionId] of topLevelSectionIds.entries()) {
    topLevelSections[sectionId] = {
      h: 120,
      w: 240,
      x: index * 300,
      y: 0,
      zIndex: index,
    };
  }
  getWorkspaceDocumentStore(host).setState({
    parentSectionMap,
    sections,
    topLevelSections,
    viewport: null,
    savedViews: null,
  });
}

function installNestedDocument(): void {
  installDocument({
    parentSectionMap: {
      nested: "parameters",
      notes: "project",
      parameters: "project",
    },
    sections: {
      nested: createSection({
        id: "nested",
        itemTree: {
          items: {
            "nested-duplicate": createBuiltInItem(
              "nested-duplicate",
              "Duplicate",
            ),
            "nested-item": createBuiltInItem("nested-item", "Momentum"),
            "nested-root": {
              children: ["nested-item", "nested-duplicate"],
              id: "nested-root",
            },
          },
          rootId: "nested-root",
          selectedItemIds: [],
        },
        kind: "parameters",
        name: "Nested tuning",
      }),
      notes: createSection({
        id: "notes",
        kind: "notes",
        name: "Notes",
      }),
      parameters: createSection({
        children: ["nested"],
        data: { findTerms: "optimizer controls", hidden: "do not index" },
        id: "parameters",
        itemTree: {
          items: {
            custom: {
              children: [],
              data: { findTerms: "batch worker", hidden: "do not index" },
              id: "custom",
            },
            duplicate: createBuiltInItem("duplicate", "Duplicate"),
            "item-root": {
              children: ["learning", "duplicate", "custom"],
              id: "item-root",
            },
            learning: createBuiltInItem("learning", "Learning rate"),
          },
          rootId: "item-root",
          selectedItemIds: [],
        },
        kind: "parameters",
        name: "Optimizer",
      }),
      project: createSection({
        children: ["parameters", "notes"],
        id: "project",
        kind: "group",
        name: "Project",
      }),
    },
    topLevelSectionIds: ["project"],
  });
}

beforeEach(() => {
  host = createWorkspaceHost();
});

afterEach(() => {
  registerSectionKinds(host, {});
  host.dispose();
});

describe("workspace Find", () => {
  it("traverses sections and nested items in canonical order with stable result ids and breadcrumbs", () => {
    registerSectionKinds(host, {
      notes: { renderContent: () => null },
      parameters: { renderContent: () => null },
    });
    installNestedDocument();

    const results = buildWorkspaceFindResults(host);

    expect(results.map((result) => result.id)).toEqual([
      "section:project",
      "section:parameters",
      "item:parameters:learning",
      "item:parameters:duplicate",
      "item:parameters:custom",
      "section:nested",
      "item:nested:nested-item",
      "item:nested:nested-duplicate",
      "section:notes",
    ]);
    expect(
      results.map((result) => ({
        breadcrumb: result.breadcrumb,
        kind: result.kind,
        label: result.label,
      })),
    ).toEqual([
      { breadcrumb: null, kind: "section", label: "Project" },
      { breadcrumb: "Project", kind: "section", label: "Optimizer" },
      {
        breadcrumb: "Project / Optimizer",
        kind: "item",
        label: "Learning rate",
      },
      {
        breadcrumb: "Project / Optimizer",
        kind: "item",
        label: "Duplicate",
      },
      {
        breadcrumb: "Project / Optimizer",
        kind: "item",
        label: "custom",
      },
      {
        breadcrumb: "Project / Optimizer",
        kind: "section",
        label: "Nested tuning",
      },
      {
        breadcrumb: "Project / Optimizer / Nested tuning",
        kind: "item",
        label: "Momentum",
      },
      {
        breadcrumb: "Project / Optimizer / Nested tuning",
        kind: "item",
        label: "Duplicate",
      },
      { breadcrumb: "Project", kind: "section", label: "Notes" },
    ]);
  });

  it("omits hidden saved-view branches and their items", () => {
    registerSectionKinds(host, {
      notes: { renderContent: () => null },
      parameters: { renderContent: () => null },
    });
    installNestedDocument();
    const state = getWorkspaceDocumentStore(host).getState();
    getWorkspaceDocumentStore(host).setState({
      savedViews: {
        activeViewId: "overview",
        views: {
          overview: {
            id: "overview",
            name: "Overview",
            sectionVisibility: {
              nested: true,
              notes: true,
              parameters: false,
              project: true,
            },
            sortIndex: 0,
            topLevelSections: { ...state.topLevelSections },
            viewport: null,
          },
        },
      },
    });

    expect(buildWorkspaceFindResults(host).map((result) => result.id)).toEqual([
      "section:project",
      "section:notes",
    ]);
  });

  it("uses the explicit opaque-text callbacks with detached frozen snapshots", () => {
    const getSectionSearchableText = vi.fn((section) => {
      expect(Object.isFrozen(section)).toBe(true);
      expect(Object.keys(section).sort()).toEqual([
        "data",
        "id",
        "kind",
        "name",
      ]);
      expect(Object.isFrozen(section.data)).toBe(true);
      return section.id === "parameters" ? "optimizer controls" : "";
    });
    const getItemSearchableText = vi.fn(({ item, section }) => {
      expect(Object.isFrozen(section)).toBe(true);
      expect(Object.isFrozen(item)).toBe(true);
      return "batch worker";
    });
    registerSectionKinds(host, {
      notes: { renderContent: () => null },
      parameters: {
        getItemSearchableText,
        getSectionSearchableText,
        renderContent: () => null,
      },
    });
    installNestedDocument();

    expect(
      resolveWorkspaceFindResults(host, "optimizer controls").map(
        (result) => result.id,
      ),
    ).toEqual(["section:parameters"]);
    expect(
      resolveWorkspaceFindResults(host, "batch worker").map(
        (result) => result.id,
      ),
    ).toEqual(["item:parameters:custom"]);
    expect(
      resolveWorkspaceFindResults(host, "custom").map((result) => result.id),
    ).toEqual(["item:parameters:custom"]);
    expect(resolveWorkspaceFindResults(host, "do not index")).toEqual([]);
    expect(getSectionSearchableText).toHaveBeenCalledTimes(8);
    expect(getItemSearchableText).toHaveBeenCalledTimes(4);
  });

  it("keeps empty-query document order and uses document order to break equal match ranks", () => {
    registerSectionKinds(host, {
      notes: { renderContent: () => null },
      parameters: { renderContent: () => null },
    });
    installNestedDocument();

    expect(
      resolveWorkspaceFindResults(host, "   ").map((result) => result.id),
    ).toEqual(buildWorkspaceFindResults(host).map((result) => result.id));
    expect(
      resolveWorkspaceFindResults(host, "duplicate").map((result) => result.id),
    ).toEqual(["item:parameters:duplicate", "item:nested:nested-duplicate"]);
  });

  it("rejects malformed section search contributions and excludes them from meta controls", () => {
    expect(() =>
      registerSectionKinds(host, {
        parameters: {
          getSectionSearchableText: "bad",
          renderContent: () => null,
        } as unknown as SectionKindDefinition,
      }),
    ).toThrowError(/getSectionSearchableText must be a function/);
    expect(() =>
      registerSectionKinds(host, {
        meta: {
          getSectionSearchableText: () => "terms",
          presentation: {
            onEdit: () => {},
            resolveControlKind: () => "text" as const,
            type: "meta-control" as const,
          },
          renderContent: () => null,
        } as unknown as SectionKindDefinition,
      }),
    ).toThrowError(/cannot register getSectionSearchableText/);
  });

  it("revalidates a result before activation", () => {
    registerSectionKinds(host, { notes: { renderContent: () => null } });
    installDocument({
      parentSectionMap: {},
      sections: {
        notes: createSection({ id: "notes", kind: "notes", name: "Notes" }),
      },
      topLevelSectionIds: ["notes"],
    });
    const result = buildWorkspaceFindResults(host)[0];
    if (!result) {
      throw new Error("Expected a Find result.");
    }
    installDocument({
      parentSectionMap: {},
      sections: {},
      topLevelSectionIds: [],
    });

    expect(result.activate()).toEqual({
      ran: false,
      statusMessage: "This result is no longer available.",
    });
  });
});
