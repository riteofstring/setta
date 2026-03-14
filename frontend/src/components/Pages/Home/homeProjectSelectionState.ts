import { type ProjectConfig } from "utils/generatedTypes";

export function resolveNextSelectedHomeProjectIdsOnSelect({
  selectedProjectIds,
  projectConfigId,
}: {
  selectedProjectIds: Array<string>;
  projectConfigId: string;
}): Array<string> {
  if (
    selectedProjectIds.length === 1 &&
    selectedProjectIds[0] === projectConfigId
  ) {
    return selectedProjectIds;
  }
  return [projectConfigId];
}

export function resolveNextSelectedHomeProjectIdsOnToggle({
  selectedProjectIds,
  projectConfigId,
}: {
  selectedProjectIds: Array<string>;
  projectConfigId: string;
}): Array<string> {
  if (selectedProjectIds.includes(projectConfigId)) {
    return selectedProjectIds.filter((id) => id !== projectConfigId);
  }
  return [...selectedProjectIds, projectConfigId];
}

export function buildHomeProjectDeleteSelection({
  selectedProjectIds,
  projects,
}: {
  selectedProjectIds: Array<string>;
  projects: Array<ProjectConfig>;
}): Array<{ id: string; name: string }> {
  return selectedProjectIds.map((projectId) => ({
    id: projectId,
    name: projects.find((project) => project.id === projectId)?.name ?? "",
  }));
}

export function shouldClearHomeProjectSelection(keyCode: string): boolean {
  return keyCode === "Escape";
}
