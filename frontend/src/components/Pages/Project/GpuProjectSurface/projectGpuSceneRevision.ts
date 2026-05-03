import type { ZustandProjectState } from "state/definitions";

export function getProjectGpuSceneRevision(
  projectState: ZustandProjectState,
): number {
  return (
    Object.keys(projectState.sections).length +
    Object.keys(projectState.sectionImpls).length +
    Object.keys(projectState.sectionVariants).length +
    Object.keys(projectState.projectConfig.topLevelSections).length
  );
}
