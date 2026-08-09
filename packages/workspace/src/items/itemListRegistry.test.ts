import { afterEach, describe, expect, it } from "vitest";
import {
  registerItemListView,
  resetItemListViews,
  resolveItemListView,
  unregisterItemListView,
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
});
