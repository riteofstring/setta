import { APP_CHROME_Z_INDEX_CLASS_NAME } from "utils/constants";
import { createProjectConfig } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { RIGHT_PANE_TITLE_CLEARANCE_CLASS_NAME } from "../../Utils/paneTitleSpacing";
import {
  HOME_SIDE_RAIL_CLASS_NAME,
  HOME_RIGHT_PANE_TITLE_CLASS_NAME,
  getHomeProjectConfigsSectionTitle,
  getProjectTopLevelSectionCount,
  partitionProjectsByFavoriteStatus,
  shouldApplyHomeFileBrowserPath,
  shouldOpenProjectOnListRowSpace,
  shouldShowCompactHomeSettingsButton,
  shouldUseCompactHomeLayout,
} from "./HomePage";

describe("HomePage", () => {
  it("uses the shared app chrome layer for desktop side rails", () => {
    expect(HOME_SIDE_RAIL_CLASS_NAME).toContain(APP_CHROME_Z_INDEX_CLASS_NAME);
  });

  it("reserves title clearance for the right pane fullscreen button", () => {
    expect(HOME_RIGHT_PANE_TITLE_CLASS_NAME).toContain(
      RIGHT_PANE_TITLE_CLEARANCE_CLASS_NAME,
    );
  });

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
    expect(getHomeProjectConfigsSectionTitle(true)).toBe("Other Projects");
    expect(getHomeProjectConfigsSectionTitle(false)).toBe("All Projects");
  });

  it("opens from keyboard Space in list rows only when selection is disabled", () => {
    expect(shouldOpenProjectOnListRowSpace(true)).toBe(false);
    expect(shouldOpenProjectOnListRowSpace(false)).toBe(true);
  });

  it("uses compact home layout only below the breakpoint", () => {
    expect(shouldUseCompactHomeLayout(600)).toBe(true);
    expect(shouldUseCompactHomeLayout(1099)).toBe(true);
    expect(shouldUseCompactHomeLayout(1100)).toBe(false);
    expect(shouldUseCompactHomeLayout(1400)).toBe(false);
  });

  it("shows the compact settings button only on compact non-deployment layout", () => {
    expect(
      shouldShowCompactHomeSettingsButton({
        isCompactLayout: true,
        isDeploymentMode: false,
      }),
    ).toBe(true);
    expect(
      shouldShowCompactHomeSettingsButton({
        isCompactLayout: true,
        isDeploymentMode: true,
      }),
    ).toBe(false);
    expect(
      shouldShowCompactHomeSettingsButton({
        isCompactLayout: false,
        isDeploymentMode: false,
      }),
    ).toBe(false);
  });

  it("applies home file-browser path changes only for real path updates", () => {
    expect(
      shouldApplyHomeFileBrowserPath({
        nextPath: "",
        currentRootPath: "/workspace",
      }),
    ).toBe(false);
    expect(
      shouldApplyHomeFileBrowserPath({
        nextPath: "/workspace",
        currentRootPath: "/workspace",
      }),
    ).toBe(false);
    expect(
      shouldApplyHomeFileBrowserPath({
        nextPath: "/workspace/new",
        currentRootPath: "/workspace",
      }),
    ).toBe(true);
  });
});
