import { describe, expect, it } from "vitest";
import type { WorkspaceSectionItemTree } from "../document/types";
import {
  calculateBoundedItemColumnWidth,
  getDeepestItemDepth,
  getDefaultItemColumnWidth,
  getItemColumnCssWidth,
  getItemColumnMargin,
} from "./itemColumnWidth";

function makeNestedItemTree(): WorkspaceSectionItemTree {
  return {
    rootId: "root",
    items: {
      root: { id: "root", children: ["a", "sibling"] },
      a: { id: "a", children: ["b"] },
      b: { id: "b", children: ["c"] },
      c: { id: "c", children: [] },
      sibling: { id: "sibling", children: [] },
    },
    selectedItemIds: [],
  };
}

describe("item column width", () => {
  it("ports the reference half-width default and center persistence offset", () => {
    expect(getDefaultItemColumnWidth(550)).toBe(275);
    expect(getItemColumnCssWidth(275)).toBe(257);
  });

  it("clamps for nesting depth and a 100 px minimum value column", () => {
    expect(getItemColumnMargin(1)).toBe(72);
    expect(getItemColumnMargin(3)).toBe(96);
    expect(calculateBoundedItemColumnWidth(0, 550, 3)).toBe(96);
    expect(calculateBoundedItemColumnWidth(999, 550, 3)).toBe(450);
    expect(calculateBoundedItemColumnWidth(120, 150, 3)).toBe(96);
  });

  it("derives the deepest canonical item instead of trusting a host depth hint", () => {
    expect(getDeepestItemDepth(makeNestedItemTree())).toBe(3);
  });
});
