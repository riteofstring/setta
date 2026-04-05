import { useAppConfigs } from "state/definitions";
import type { ProjectStateSingleConfigWithCompletedOpIDs } from "utils/generatedTypes";

export function processAppProjectStateUpdateFromBackend(
  payload: ProjectStateSingleConfigWithCompletedOpIDs,
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
