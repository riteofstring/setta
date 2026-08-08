import type { GetLatestProjectStateResponse } from "@setta/app-subsystem-frontend-sdk";
import { useAppConfigs } from "../../appSubsystemProjectState";

export function processAppProjectStateUpdateFromBackend(
  payload: GetLatestProjectStateResponse,
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
