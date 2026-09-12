import { describe, expect, it } from "vitest";
import {
  resolveActiveSectionChange,
  type ActiveSectionPolicyContext,
  type ActiveSectionPolicyResult,
} from "./activeSectionPolicy";

type PolicyCase = {
  context: ActiveSectionPolicyContext;
  expected: ActiveSectionPolicyResult;
};

describe("resolveActiveSectionChange", () => {
  it.each<PolicyCase>([
    {
      context: { interaction: "pane-click", activeIds: ["section-a"] },
      expected: {
        nextActiveIds: [],
        updateZIndex: false,
        reason: "pane-click:clear",
      },
    },
    {
      context: {
        interaction: "selection-rect",
        activeIds: ["section-a"],
        selectedIds: ["section-b", "section-c"],
      },
      expected: {
        nextActiveIds: ["section-b", "section-c"],
        updateZIndex: false,
        reason: "selection-rect:update",
      },
    },
    {
      context: {
        interaction: "input-focus",
        activeIds: ["section-a", "section-b"],
        sectionId: "section-c",
      },
      expected: {
        nextActiveIds: ["section-c"],
        updateZIndex: true,
        reason: "input-focus:set-active",
      },
    },
  ])("handles simple policy branches for %o", ({ context, expected }) => {
    expect(resolveActiveSectionChange(context)).toEqual(expected);
  });

  it("adds and removes the clicked section during multi-selection mode", () => {
    expect(
      resolveActiveSectionChange({
        interaction: "section-click",
        activeIds: ["section-a"],
        sectionId: "section-b",
        isSelectingItems: false,
        hasSelectedItems: false,
        multiSelectionActive: true,
      }),
    ).toEqual({
      nextActiveIds: ["section-a", "section-b"],
      updateZIndex: true,
      reason: "section-click:multi-add",
    });

    expect(
      resolveActiveSectionChange({
        interaction: "section-click",
        activeIds: ["section-a", "section-b"],
        sectionId: "section-b",
        isSelectingItems: false,
        hasSelectedItems: false,
        multiSelectionActive: true,
      }),
    ).toEqual({
      nextActiveIds: ["section-a"],
      updateZIndex: true,
      reason: "section-click:multi-remove",
    });
  });

  it("replaces the active ids during a normal section click", () => {
    expect(
      resolveActiveSectionChange({
        interaction: "section-click",
        activeIds: ["section-a"],
        sectionId: "section-b",
        isSelectingItems: false,
        hasSelectedItems: false,
        multiSelectionActive: false,
      }),
    ).toEqual({
      nextActiveIds: ["section-b"],
      updateZIndex: true,
      reason: "section-click:single",
    });
  });

  it("ignores item toggles when item selection mode is inactive", () => {
    expect(
      resolveActiveSectionChange({
        interaction: "item-select",
        activeIds: ["section-a"],
        sectionId: "section-b",
        isSelectingItems: false,
      }),
    ).toEqual({
      nextActiveIds: ["section-a"],
      updateZIndex: false,
      reason: "item-toggle:ignored",
    });
  });

  it("activates the target section for item toggles during item selection mode", () => {
    expect(
      resolveActiveSectionChange({
        interaction: "item-unselect",
        activeIds: ["section-a"],
        sectionId: "section-b",
        isSelectingItems: true,
      }),
    ).toEqual({
      nextActiveIds: ["section-b"],
      updateZIndex: false,
      reason: "item-unselect:set-active",
    });
  });

  it("keeps the current active ids when section clicks happen in item mode without selected items", () => {
    expect(
      resolveActiveSectionChange({
        interaction: "section-click",
        activeIds: ["section-a"],
        sectionId: "section-b",
        isSelectingItems: true,
        hasSelectedItems: false,
        multiSelectionActive: false,
      }),
    ).toEqual({
      nextActiveIds: ["section-a"],
      updateZIndex: true,
      reason: "section-click:item-select-noop",
    });
  });

  it("activates the clicked section when section clicks happen in item mode with selected items", () => {
    expect(
      resolveActiveSectionChange({
        interaction: "section-click",
        activeIds: ["section-a"],
        sectionId: "section-b",
        isSelectingItems: true,
        hasSelectedItems: true,
        multiSelectionActive: true,
      }),
    ).toEqual({
      nextActiveIds: ["section-b"],
      updateZIndex: true,
      reason: "section-click:item-select-set",
    });
  });
});
