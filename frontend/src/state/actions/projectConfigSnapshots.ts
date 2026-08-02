import { useProjectState } from "state/definitions";
import type { ProjectConfig } from "utils/generatedTypes";

export function publishProjectConfigSnapshot(
  projectConfigId: string,
  projectConfig: ProjectConfig,
): void {
  useProjectState.setState((state) => {
    if (state.projectConfig.id !== projectConfigId) {
      return;
    }
    state.projectConfig = projectConfig;
  });
}
