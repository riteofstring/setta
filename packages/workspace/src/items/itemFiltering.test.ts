import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerSectionKinds } from "../document/sectionKindRegistry.js";
import type { WorkspaceItem, WorkspaceSection } from "../document/types.js";
import { createWorkspaceHost, type WorkspaceHost } from "../workspaceHost.js";
import { filterWorkspaceSectionItems } from "./itemFiltering.js";

let host: WorkspaceHost;

beforeEach(() => {
  host = createWorkspaceHost();
});

function makeBuiltInItem(
  id: string,
  label: string,
  children: Array<string> = [],
): WorkspaceItem {
  return {
    id,
    children,
    presentation: { label, labelEditable: true, control: { kind: "group" } },
  };
}

function makeSection(): WorkspaceSection {
  return {
    id: "panel",
    kind: "parameters",
    name: "Parameters",
    size: { width: 320, height: 240 },
    isMinimized: false,
    positionAndSizeLocked: false,
    isHorizontalOrientation: false,
    styleColor: null,
    overflowMode: false,
    tagColor: null,
    children: [],
    itemTree: {
      rootId: "root",
      items: {
        root: { id: "root", children: ["alpha", "options", "custom"] },
        alpha: makeBuiltInItem("alpha", "Learning rate"),
        options: makeBuiltInItem("options", "Options", ["momentum"]),
        momentum: makeBuiltInItem("momentum", "Optimizer momentum"),
        custom: {
          id: "custom",
          children: [],
          data: { keywords: "batch worker count" },
        },
      },
      selectedItemIds: [],
    },
  };
}

describe("package-owned item filtering", () => {
  afterEach(() => {
    registerSectionKinds(host, {});
    host.dispose();
  });

  it("fuzzy-matches built-in labels, reveals ancestor paths, and keeps document order", () => {
    registerSectionKinds(host, { parameters: { renderContent: () => null } });
    const result = filterWorkspaceSectionItems(host, makeSection(), "op mm");

    expect(result.filterActive).toBe(true);
    expect([...result.matchingItemIds]).toEqual(["momentum"]);
    expect([...result.visibleItemIds]).toEqual(["momentum", "options"]);
  });

  it("searches custom items only through the owning kind's frozen text contribution", () => {
    const getItemSearchableText = vi.fn(({ section, item }) => {
      expect(Object.isFrozen(section)).toBe(true);
      expect(Object.keys(section).sort()).toEqual([
        "data",
        "id",
        "kind",
        "name",
      ]);
      expect(Object.isFrozen(item)).toBe(true);
      const data = item.data;
      return data && typeof data === "object" && !Array.isArray(data)
        ? String(data["keywords"] ?? "")
        : "";
    });
    registerSectionKinds(host, {
      parameters: { renderContent: () => null, getItemSearchableText },
    });

    const result = filterWorkspaceSectionItems(host, makeSection(), "worker");
    expect([...result.matchingItemIds]).toEqual(["custom"]);
    expect([...result.visibleItemIds]).toEqual(["custom"]);
    expect(getItemSearchableText).toHaveBeenCalledOnce();
  });

  it("does not call custom contributions for an inactive filter", () => {
    const getItemSearchableText = vi.fn(() => "custom");
    registerSectionKinds(host, {
      parameters: { renderContent: () => null, getItemSearchableText },
    });

    const result = filterWorkspaceSectionItems(host, makeSection(), "   ");
    expect(result.filterActive).toBe(false);
    expect([...result.visibleItemIds]).toEqual([
      "alpha",
      "options",
      "momentum",
      "custom",
    ]);
    expect(getItemSearchableText).not.toHaveBeenCalled();
  });

  it("leaves custom items unsearchable without an explicit contribution", () => {
    registerSectionKinds(host, { parameters: { renderContent: () => null } });
    expect(
      filterWorkspaceSectionItems(host, makeSection(), "worker").matchingItemIds
        .size,
    ).toBe(0);
  });

  it("fails specifically when a JavaScript host returns malformed searchable text", () => {
    registerSectionKinds(host, {
      parameters: {
        renderContent: () => null,
        getItemSearchableText: (() => ["worker"]) as unknown as () => string,
      },
    });
    expect(() =>
      filterWorkspaceSectionItems(host, makeSection(), "worker"),
    ).toThrowError(/non-string searchable text for item custom/);
  });
});
