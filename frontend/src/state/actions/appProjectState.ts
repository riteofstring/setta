import { useAppConfigs } from "state/definitions";
import type { ProjectStateSingleConfigWithCompletedOpIds } from "utils/generatedTypes";

export function processAppProjectStateUpdateFromBackend(
  payload: ProjectStateSingleConfigWithCompletedOpIds,
) {
  const nextState = payload.projectState;
  useAppConfigs.setState((state) => {
    const existing = state.configs[nextState.projectConfig.id];
    return {
      configs: {
        ...state.configs,
        [nextState.projectConfig.id]: {
          ...nextState,
          previewSectionVariantMap: existing?.previewSectionVariantMap ?? {},
        },
      },
    };
  });
}
