import { useAllProjectMetadata, useProjectState } from "state/definitions";
import type { ProjectStateSingleConfig } from "utils/generatedTypes";

export function applyProjectCodegenTargetsResponse(
  projectState: ProjectStateSingleConfig,
): void {
  const { id: projectConfigId, codegenTargets } = projectState.projectConfig;

  useAllProjectMetadata.setState((state) => ({
    ...state,
    projectMetadata: state.projectMetadata.map((entry) =>
      entry.id === projectConfigId
        ? { ...entry, codegenTargets: [...codegenTargets] }
        : entry,
    ),
  }));

  useProjectState.setState((state) => {
    if (state.projectConfig.id !== projectConfigId) {
      return;
    }
    state.projectConfig.codegenTargets = [...codegenTargets];
  });
}
