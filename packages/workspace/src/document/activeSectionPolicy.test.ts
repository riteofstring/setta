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

// These cases characterize the reference's resolveActiveSectionChange for the interactions
// reachable in the Phase 1 slice; expected values must not drift from the reference.
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
  ])("handles simple policy branches for %o", ({ context, expected }) => {
    expect(resolveActiveSectionChange(context)).toEqual(expected);
  });

  it("adds and removes the clicked section during multi-selection mode", () => {
    expect(
      resolveActiveSectionChange({
        interaction: "section-click",
        activeIds: ["section-a"],
        sectionId: "section-b",
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
        multiSelectionActive: false,
      }),
    ).toEqual({
      nextActiveIds: ["section-b"],
      updateZIndex: true,
      reason: "section-click:single",
    });
  });
});
