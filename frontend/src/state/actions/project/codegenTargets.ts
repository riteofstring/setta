import { useAllProjectMetadata, useProjectState } from "state/definitions";
import type { SingleConfig } from "utils/generatedTypes";
import { loadProjectState } from "./loadProject";

export function applyProjectCodegenTargetsResponse(
  projectState: SingleConfig,
): void {
  const { id: projectConfigId } = projectState.projectConfig;

  useAllProjectMetadata.setState((state) => ({
    ...state,
    projectMetadata: state.projectMetadata.map((entry) =>
      entry.id === projectConfigId ? projectState.projectConfig : entry,
    ),
  }));

  if (useProjectState.getState().projectConfig.id !== projectConfigId) {
    return;
  }
  void loadProjectState(projectState);
}
