import { describe, expect, it } from "vitest";

import {
  WORKSPACE_DEFAULT_CAPABILITIES,
  type WorkspaceDocument,
  type WorkspaceSection,
} from "../src/core.js";
import { planWorkspaceSelectionActions } from "../src/internal/workspace-selection-actions.js";
import { createWorkspaceTestDocument } from "../src/testing.js";

function actionDocument(): WorkspaceDocument {
  const flat = createWorkspaceTestDocument([
    { id: "alpha", title: "Alpha" },
    { id: "beta", title: "Beta" },
    { id: "child", title: "Child" },
  ]);
  const beta = flat.sections.beta as WorkspaceSection;
  return {
    ...flat,
    rootSections: flat.rootSections.filter(({ sectionId }) => sectionId !== "child"),
    sections: {
      ...flat.sections,
      beta: {
        ...beta,
        childLayout: { orientation: "vertical", overflow: "grow", sectionIds: ["child"] },
      },
    },
  };
}

function actionReason(
  document: WorkspaceDocument,
  selectedSectionIds: readonly string[],
  actionId: string,
): string | null | undefined {
  return planWorkspaceSelectionActions(
    document,
    selectedSectionIds,
    WORKSPACE_DEFAULT_CAPABILITIES,
  ).actions.find(({ id }) => id === actionId)?.disabledReason;
}

describe("workspace selection actions", () => {
  it("keeps every action unavailable when there is no selection", () => {
    const plan = planWorkspaceSelectionActions(
      actionDocument(),
      [],
      WORKSPACE_DEFAULT_CAPABILITIES,
    );

    expect(plan.summary).toBe("0 sections selected");
    expect(plan.actions.every(({ disabledReason }) => disabledReason !== null)).toBe(true);
    expect(plan.actions.find(({ id }) => id === "delete")?.disabledReason).toBe(
      "Select at least one section.",
    );
  });

  it("normalizes ancestor selections and reports the available batch state actions", () => {
    const document = actionDocument();
    const plan = planWorkspaceSelectionActions(
      document,
      ["child", "beta"],
      WORKSPACE_DEFAULT_CAPABILITIES,
    );

    expect(plan.sectionIds).toEqual(["beta"]);
    expect(plan.summary).toBe("1 section selected");
    expect(plan.actions.find(({ id }) => id === "lock")?.disabledReason).toBeNull();
    expect(plan.actions.find(({ id }) => id === "unlock")?.disabledReason).toBe(
      "The selected section is already unlocked.",
    );
    expect(plan.actions.find(({ id }) => id === "delete")?.disabledReason).toBeNull();
  });

  it("explains mixed-parent grouping and every persistent stacking boundary", () => {
    const document = actionDocument();

    expect(actionReason(document, ["alpha", "child"], "group")).toBe(
      "Selected sections must share one parent to be grouped.",
    );
    expect(actionReason(document, ["alpha"], "send-to-back")).toBe(
      "Selected sections are already at the back.",
    );
    expect(actionReason(document, ["alpha"], "bring-forward")).toBeNull();
    expect(actionReason(document, ["beta"], "bring-to-front")).toBe(
      "Selected sections are already at the front.",
    );
  });

  it("keeps disabled actions discoverable with specific capability explanations", () => {
    const document = actionDocument();
    const plan = planWorkspaceSelectionActions(document, ["alpha", "beta"], {
      editLayout: false,
      editPresentation: true,
      editStructure: false,
    });

    for (const actionId of [
      "lock",
      "unlock",
      "bring-to-front",
      "bring-forward",
      "send-backward",
      "send-to-back",
    ]) {
      expect(plan.actions.find(({ id }) => id === actionId)?.disabledReason).toBe(
        "Turn on layout editing to use this action.",
      );
    }
    for (const actionId of ["group", "ungroup", "delete"]) {
      expect(plan.actions.find(({ id }) => id === actionId)?.disabledReason).toBe(
        "Turn on structure editing to use this action.",
      );
    }
  });
});
