import { createProjectConfig } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  getHomeProjectConfigsSectionTitle,
  partitionProjectsByFavoriteStatus,
  reconcileFavoriteProjectConfigIds,
  reconcileSelectedHomeProjectIds,
  resolveActiveHomeProjectId,
  resolveHomeWorkspaceChromeState,
  resolveSelectedHomeProject,
  shouldApplyHomeFileBrowserPath,
  shouldOpenProjectOnListRowSpace,
  shouldShowCompactHomeSettingsButton,
  shouldUseCompactHomeLayout,
} from "./homeWorkspaceState";

describe("homeWorkspaceState", () => {
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

  it("reconciles favorite and selected ids against the current project set", () => {
    const projectA = createProjectConfig({ id: "project-a", name: "A" });
    const projectB = createProjectConfig({ id: "project-b", name: "B" });

    expect(
      reconcileFavoriteProjectConfigIds({
        projects: [projectA, projectB],
        favoriteProjectConfigIds: ["project-a", "missing", "project-b"],
      }),
    ).toEqual(["project-a", "project-b"]);
    expect(
      reconcileSelectedHomeProjectIds({
        projects: [projectA, projectB],
        selectedProjectIds: ["missing", "project-b"],
      }),
    ).toEqual(["project-b"]);
  });

  it("resolves the active and selected projects from filtered and full project sets", () => {
    const projectA = createProjectConfig({ id: "project-a", name: "A" });
    const projectB = createProjectConfig({ id: "project-b", name: "B" });
    const projectC = createProjectConfig({ id: "project-c", name: "C" });

    expect(
      resolveActiveHomeProjectId({
        filteredProjects: [projectB, projectC],
        activeProjectId: "project-a",
      }),
    ).toBe("project-b");
    expect(
      resolveActiveHomeProjectId({
        filteredProjects: [],
        activeProjectId: "project-a",
      }),
    ).toBeNull();

    expect(
      resolveSelectedHomeProject({
        selectedProjectIds: ["project-a"],
        filteredProjects: [projectB, projectC],
        projects: [projectA, projectB, projectC],
        activeProjectId: "project-c",
      })?.id,
    ).toBe("project-a");
    expect(
      resolveSelectedHomeProject({
        selectedProjectIds: [],
        filteredProjects: [projectB, projectC],
        projects: [projectA, projectB, projectC],
        activeProjectId: "project-c",
      })?.id,
    ).toBe("project-c");
  });

  it("derives chrome state for compact and side-pane home layouts", () => {
    expect(
      resolveHomeWorkspaceChromeState({
        isCompactLayout: true,
        homeWorkspacePaneVis: true,
        homeWorkspacePaneWidth: 320,
        homeSelectedProjectPaneVis: true,
        homeSelectedProjectPaneWidth: 280,
        isDeploymentMode: false,
      }),
    ).toEqual({
      showSidePanes: false,
      middleInsetLeft: 0,
      middleInsetRight: 0,
      showCompactSettingsButton: true,
    });

    expect(
      resolveHomeWorkspaceChromeState({
        isCompactLayout: false,
        homeWorkspacePaneVis: false,
        homeWorkspacePaneWidth: 320,
        homeSelectedProjectPaneVis: true,
        homeSelectedProjectPaneWidth: 280,
        isDeploymentMode: false,
      }),
    ).toEqual({
      showSidePanes: true,
      middleInsetLeft: 40,
      middleInsetRight: 280,
      showCompactSettingsButton: false,
    });
  });
});
