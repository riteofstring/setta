import { buildSharePath, pathRelativeToProject } from "utils/constants";
import type { ProjectConfig } from "utils/generatedTypes";

export function getProjectTopLevelSectionCount(project: ProjectConfig): number {
  return Object.keys(project.topLevelSections).length;
}

export function resolveHomeProjectPath(
  projectName: string,
  isDeploymentMode: boolean,
): string {
  if (!isDeploymentMode) {
    return pathRelativeToProject(projectName);
  }
  return buildSharePath(projectName);
}
