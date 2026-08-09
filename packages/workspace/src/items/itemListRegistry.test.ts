import { afterEach, describe, expect, it } from "vitest";
import {
  isItemListViewRegistered,
  registerItemListView,
  resetItemListViews,
  resolveItemListView,
  unregisterItemListView,
  updateItemListView,
  type RegisteredItemListView,
} from "./itemListRegistry";

// Freezes drag-start list-view resolution: the drag's own list key wins when it shows the
// active item, other registered lists fall back in mount order (the reference's fixed
// pinned-then-unpinned fallback generalized to host-registered lists), and an item hidden
// from every list resolves nothing.

function makeView(
  listKey: string,
  visibleItemIds: Array<string>,
  overrides: Partial<RegisteredItemListView> = {},
): RegisteredItemListView {
  return {
    listKey,
    topLevelItemIds: visibleItemIds,
    visibleItemIds: new Set(visibleItemIds),
    filterActive: false,
    ...overrides,
  };
}

afterEach(() => {
  resetItemListViews();
});

describe("resolveItemListView", () => {
  it("prefers the drag's list key when it shows the active item", () => {
    registerItemListView("section", makeView("pinned", ["item-a"]));
    registerItemListView("section", makeView("unpinned", ["item-a", "item-b"]));

    expect(resolveItemListView("section", "item-a", "unpinned")?.listKey).toBe("unpinned");
    expect(resolveItemListView("section", "item-a", "pinned")?.listKey).toBe("pinned");
  });

  it("falls back through the section's other lists in mount order", () => {
    registerItemListView("section", makeView("pinned", ["item-a"]));
    registerItemListView("section", makeView("unpinned", ["item-b"]));

    expect(resolveItemListView("section", "item-b", "pinned")?.listKey).toBe("unpinned");
    expect(resolveItemListView("section", "item-a", null)?.listKey).toBe("pinned");
    expect(resolveItemListView("section", "item-c", "pinned")).toBeNull();
    expect(resolveItemListView("other-section", "item-a", "pinned")).toBeNull();
  });

  it("drops unregistered lists", () => {
    registerItemListView("section", makeView("main", ["item-a"]));
    unregisterItemListView("section", "main");

    expect(resolveItemListView("section", "item-a", "main")).toBeNull();
  });

  it("keeps the mount order when a registered view updates in place", () => {
    registerItemListView("section", makeView("pinned", ["item-a"]));
    registerItemListView("section", makeView("unpinned", ["item-a"]));

    updateItemListView("section", makeView("pinned", ["item-a", "item-b"]));

    // The fallback still resolves the first-mounted list, not the most recently updated one.
    expect(resolveItemListView("section", "item-a", null)?.listKey).toBe("pinned");
    expect(resolveItemListView("section", "item-b", null)?.listKey).toBe("pinned");
  });

  it("fails loudly on a list key carrying a reserved dnd token", () => {
    expect(() =>
      registerItemListView("section", makeView("bad::settaParamList::key", ["item-a"])),
    ).toThrow(/contains the reserved dnd token "::settaParamList::"/);
    expect(() =>
      registerItemListView("section", makeView("bad::TempParamDND", ["item-a"])),
    ).toThrow(/contains the reserved dnd token "::TempParamDND"/);
  });

  it("fails loudly on a duplicate list key registration", () => {
    registerItemListView("section", makeView("main", ["item-a"]));

    expect(() => registerItemListView("section", makeView("main", ["item-b"]))).toThrow(
      'item list key "main" is already registered for section "section"',
    );
  });

  it("fails loudly when updating an unregistered view", () => {
    expect(() => updateItemListView("section", makeView("main", ["item-a"]))).toThrow(
      'item list key "main" is not registered for section "section"',
    );
    expect(isItemListViewRegistered("section", "main")).toBe(false);
  });
});
