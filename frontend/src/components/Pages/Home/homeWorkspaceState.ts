import { CLOSED_PANE_WIDTH } from "utils/constants";
import { type ProjectConfig } from "utils/generatedTypes";

const HOME_COMPACT_LAYOUT_BREAKPOINT_PX = 1100;

export function shouldUseCompactHomeLayout(
  winWidth: number | undefined,
): boolean {
  if (typeof winWidth === "number") {
    return winWidth < HOME_COMPACT_LAYOUT_BREAKPOINT_PX;
  }
  if (typeof window !== "undefined") {
    return window.innerWidth < HOME_COMPACT_LAYOUT_BREAKPOINT_PX;
  }
  return false;
}

export function shouldApplyHomeFileBrowserPath({
  nextPath,
  currentRootPath,
}: {
  nextPath: string;
  currentRootPath: string | null;
}): boolean {
  if (!nextPath) {
    return false;
  }
  return nextPath !== currentRootPath;
}

export function partitionProjectsByFavoriteStatus({
  projects,
  favoriteProjectConfigIds,
}: {
  projects: Array<ProjectConfig>;
  favoriteProjectConfigIds: Set<string>;
}): {
  favoriteProjects: Array<ProjectConfig>;
  nonFavoriteProjects: Array<ProjectConfig>;
  totalProjectsCount: number;
} {
  const favoriteProjects: Array<ProjectConfig> = [];
  const nonFavoriteProjects: Array<ProjectConfig> = [];
  for (const project of projects) {
    if (favoriteProjectConfigIds.has(project.id)) {
      favoriteProjects.push(project);
      continue;
    }
    nonFavoriteProjects.push(project);
  }
  return {
    favoriteProjects,
    nonFavoriteProjects,
    totalProjectsCount: projects.length,
  };
}

export function getHomeProjectConfigsSectionTitle(
  hasFavorites: boolean,
): string {
  if (hasFavorites) {
    return "Other Projects";
  }
  return "All Projects";
}

export function shouldOpenProjectOnListRowSpace(
  selectionEnabled: boolean,
): boolean {
  return !selectionEnabled;
}

export function shouldShowCompactHomeSettingsButton({
  isCompactLayout,
  isDeploymentMode,
}: {
  isCompactLayout: boolean;
  isDeploymentMode: boolean;
}): boolean {
  return isCompactLayout && !isDeploymentMode;
}

export function reconcileFavoriteProjectConfigIds({
  projects,
  favoriteProjectConfigIds,
}: {
  projects: Array<ProjectConfig>;
  favoriteProjectConfigIds: string[];
}): string[] {
  const validProjectIds = new Set(projects.map((project) => project.id));
  return favoriteProjectConfigIds.filter((id) => validProjectIds.has(id));
}

export function reconcileSelectedHomeProjectIds({
  projects,
  selectedProjectIds,
}: {
  projects: Array<ProjectConfig>;
  selectedProjectIds: string[];
}): string[] {
  const validProjectIds = new Set(projects.map((project) => project.id));
  return selectedProjectIds.filter((id) => validProjectIds.has(id));
}

export function resolveActiveHomeProjectId({
  filteredProjects,
  activeProjectId,
}: {
  filteredProjects: Array<ProjectConfig>;
  activeProjectId: string | null;
}): string | null {
  if (filteredProjects.length === 0) {
    return null;
  }
  const activeExists = filteredProjects.some(
    (project) => project.id === activeProjectId,
  );
  if (activeExists) {
    return activeProjectId;
  }
  return filteredProjects[0]?.id ?? null;
}

export function resolveSelectedHomeProject({
  selectedProjectIds,
  filteredProjects,
  projects,
  activeProjectId,
}: {
  selectedProjectIds: string[];
  filteredProjects: Array<ProjectConfig>;
  projects: Array<ProjectConfig>;
  activeProjectId: string | null;
}): ProjectConfig | null {
  if (selectedProjectIds.length > 0) {
    const selectedProjectId = selectedProjectIds[0];
    const selected = filteredProjects.find(
      (project) => project.id === selectedProjectId,
    );
    if (selected) {
      return selected;
    }
    const fallback = projects.find(
      (project) => project.id === selectedProjectId,
    );
    if (fallback) {
      return fallback;
    }
  }
  if (activeProjectId) {
    const active = filteredProjects.find(
      (project) => project.id === activeProjectId,
    );
    if (active) {
      return active;
    }
  }
  return filteredProjects[0] ?? null;
}

export function resolveHomeWorkspaceChromeState({
  isCompactLayout,
  homeWorkspacePaneVis,
  homeWorkspacePaneWidth,
  homeSelectedProjectPaneVis,
  homeSelectedProjectPaneWidth,
  isDeploymentMode,
}: {
  isCompactLayout: boolean;
  homeWorkspacePaneVis: boolean;
  homeWorkspacePaneWidth: number;
  homeSelectedProjectPaneVis: boolean;
  homeSelectedProjectPaneWidth: number;
  isDeploymentMode: boolean;
}) {
  const showSidePanes = !isCompactLayout;
  const middleInsetLeft = showSidePanes
    ? homeWorkspacePaneVis
      ? homeWorkspacePaneWidth
      : CLOSED_PANE_WIDTH
    : 0;
  const middleInsetRight = showSidePanes
    ? homeSelectedProjectPaneVis
      ? homeSelectedProjectPaneWidth
      : CLOSED_PANE_WIDTH
    : 0;

  return {
    showSidePanes,
    middleInsetLeft,
    middleInsetRight,
    showCompactSettingsButton: shouldShowCompactHomeSettingsButton({
      isCompactLayout,
      isDeploymentMode,
    }),
  };
}
