import { describe, expect, it } from "vitest";
import {
  type ActiveSectionPolicyContext,
  type ActiveSectionPolicyResult,
  resolveActiveSectionChange,
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
        activeIds: ["section-a"],
        sectionId: "section-b",
      },
      expected: {
        nextActiveIds: ["section-b"],
        updateZIndex: true,
        reason: "input-focus:set-active",
      },
    },
    {
      context: {
        interaction: "go-to",
        activeIds: ["section-a"],
        sectionId: "section-b",
      },
      expected: {
        nextActiveIds: ["section-b"],
        updateZIndex: true,
        reason: "go-to:set-active",
      },
    },
  ])("handles simple policy branches for %o", ({ context, expected }) => {
    expect(resolveActiveSectionChange(context)).toEqual(expected);
  });

  it("ignores param toggles when param selection mode is inactive", () => {
    expect(
      resolveActiveSectionChange({
        interaction: "param-select",
        activeIds: ["section-a"],
        sectionId: "section-b",
        isSelectingParams: false,
        hasSelectedParams: true,
      }),
    ).toEqual({
      nextActiveIds: ["section-a"],
      updateZIndex: false,
      reason: "param-toggle:ignored",
    });
  });

  it("activates the target section for param toggles during param selection mode", () => {
    expect(
      resolveActiveSectionChange({
        interaction: "param-unselect",
        activeIds: ["section-a"],
        sectionId: "section-b",
        isSelectingParams: true,
        hasSelectedParams: false,
      }),
    ).toEqual({
      nextActiveIds: ["section-b"],
      updateZIndex: false,
      reason: "param-unselect:set-active",
    });
  });

  it("keeps the current active ids when section clicks happen in param mode without selected params", () => {
    expect(
      resolveActiveSectionChange({
        interaction: "section-click",
        activeIds: ["section-a"],
        sectionId: "section-b",
        isSelectingParams: true,
        hasSelectedParams: false,
        multiSelectionActive: false,
      }),
    ).toEqual({
      nextActiveIds: ["section-a"],
      updateZIndex: true,
      reason: "section-click:param-select-noop",
    });
  });

  it("activates the clicked section when section clicks happen in param mode with selected params", () => {
    expect(
      resolveActiveSectionChange({
        interaction: "section-click",
        activeIds: ["section-a"],
        sectionId: "section-b",
        isSelectingParams: true,
        hasSelectedParams: true,
        multiSelectionActive: false,
      }),
    ).toEqual({
      nextActiveIds: ["section-b"],
      updateZIndex: true,
      reason: "section-click:param-select-set",
    });
  });

  it("adds and removes the clicked section during multi-selection mode", () => {
    expect(
      resolveActiveSectionChange({
        interaction: "section-click",
        activeIds: ["section-a"],
        sectionId: "section-b",
        isSelectingParams: false,
        hasSelectedParams: false,
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
        isSelectingParams: false,
        hasSelectedParams: false,
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
        isSelectingParams: false,
        hasSelectedParams: false,
        multiSelectionActive: false,
      }),
    ).toEqual({
      nextActiveIds: ["section-b"],
      updateZIndex: true,
      reason: "section-click:single",
    });
  });
});
