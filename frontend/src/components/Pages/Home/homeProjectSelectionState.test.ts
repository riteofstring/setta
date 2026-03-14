import { createProjectConfig } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  buildHomeProjectDeleteSelection,
  resolveNextSelectedHomeProjectIdsOnSelect,
  resolveNextSelectedHomeProjectIdsOnToggle,
  shouldClearHomeProjectSelection,
} from "./homeProjectSelectionState";

describe("homeProjectSelectionState", () => {
  it("keeps a single-project selection stable when reselecting it", () => {
    expect(
      resolveNextSelectedHomeProjectIdsOnSelect({
        selectedProjectIds: ["project-1"],
        projectConfigId: "project-1",
      }),
    ).toEqual(["project-1"]);
  });

  it("replaces the selection with the newly selected project", () => {
    expect(
      resolveNextSelectedHomeProjectIdsOnSelect({
        selectedProjectIds: ["project-1", "project-2"],
        projectConfigId: "project-3",
      }),
    ).toEqual(["project-3"]);
  });

  it("toggles project ids into and out of the selection", () => {
    expect(
      resolveNextSelectedHomeProjectIdsOnToggle({
        selectedProjectIds: ["project-1"],
        projectConfigId: "project-2",
      }),
    ).toEqual(["project-1", "project-2"]);
    expect(
      resolveNextSelectedHomeProjectIdsOnToggle({
        selectedProjectIds: ["project-1", "project-2"],
        projectConfigId: "project-2",
      }),
    ).toEqual(["project-1"]);
  });

  it("builds the delete payload from selected ids in order", () => {
    const projects = [
      createProjectConfig({ id: "project-1", name: "Alpha" }),
      createProjectConfig({ id: "project-2", name: "Beta" }),
    ];

    expect(
      buildHomeProjectDeleteSelection({
        selectedProjectIds: ["project-2", "project-1", "project-3"],
        projects,
      }),
    ).toEqual([
      { id: "project-2", name: "Beta" },
      { id: "project-1", name: "Alpha" },
      { id: "project-3", name: "" },
    ]);
  });

  it("only clears selection on Escape", () => {
    expect(shouldClearHomeProjectSelection("Escape")).toBe(true);
    expect(shouldClearHomeProjectSelection("Enter")).toBe(false);
  });
});
