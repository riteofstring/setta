import { createProjectConfig } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  getHomeProjectConfigsSectionTitle,
  getProjectTopLevelSectionCount,
  partitionProjectsByFavoriteStatus,
  shouldOpenProjectOnListRowSpace,
} from "./HomePage";

describe("HomePage", () => {
  it("counts top-level sections from object keys", () => {
    const project = createProjectConfig({
      id: "project-1",
      topLevelSections: {
        sectionA: { x: 0, y: 0, w: null, h: null },
        sectionB: { x: 1, y: 1, w: 100, h: 120 },
      },
    });

    expect(getProjectTopLevelSectionCount(project)).toBe(2);
  });

  it("partitions favorite and non-favorite projects in a single pass result", () => {
    const projectA = createProjectConfig({ id: "project-a", name: "A" });
    const projectB = createProjectConfig({ id: "project-b", name: "B" });
    const projectC = createProjectConfig({ id: "project-c", name: "C" });

    const partitioned = partitionProjectsByFavoriteStatus({
      projects: [projectA, projectB, projectC],
      favoriteProjectConfigIds: new Set(["project-a", "project-c"]),
    });

    expect(partitioned.favoriteProjects.map((project) => project.id)).toEqual([
      "project-a",
      "project-c",
    ]);
    expect(
      partitioned.nonFavoriteProjects.map((project) => project.id),
    ).toEqual(["project-b"]);
    expect(partitioned.totalProjectsCount).toBe(3);
  });

  it("labels the non-favorite section as 'Other' when favorites are present", () => {
    expect(getHomeProjectConfigsSectionTitle(true)).toBe(
      "Other Project Configs",
    );
    expect(getHomeProjectConfigsSectionTitle(false)).toBe("All Configs");
  });

  it("opens from keyboard Space in list rows only when selection is disabled", () => {
    expect(shouldOpenProjectOnListRowSpace(true)).toBe(false);
    expect(shouldOpenProjectOnListRowSpace(false)).toBe(true);
  });
});
