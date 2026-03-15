import { ensureAppSessionFromCurrentDeployment } from "state/actions/appSessionState";
import { useAppConfigs, useAppDefinition } from "state/stores/appStores";
import { useProjectLoading } from "state/stores/projectStatusStores";
import { useShareSession } from "state/stores/sessionStores";
import { resetProjectStores } from "state/utils";
import { res200 } from "utils/endpointUtils";
import {
  route_get_app_deployment_state,
  route_load_app_project_config,
} from "utils/generatedEndpoints";
import type { ProjectStateSingleConfig } from "utils/generatedTypes";

export async function loadAppDeploymentState({
  projectConfigId,
}: {
  projectConfigId?: string;
} = {}): Promise<boolean> {
  const shareSession = useShareSession.getState();
  if (
    !shareSession.isDeploymentMode ||
    shareSession.deploymentMode !== "app" ||
    !shareSession.shareDeploymentName ||
    !shareSession.shareDeploymentVersion
  ) {
    return false;
  }

  const res = projectConfigId
    ? await route_load_app_project_config(
        shareSession.shareDeploymentName,
        shareSession.shareDeploymentVersion,
        { projectConfigId },
      )
    : await route_get_app_deployment_state(
        shareSession.shareDeploymentName,
        shareSession.shareDeploymentVersion,
      );
  if (!res200(res)) {
    return false;
  }
  if (res.data.appDefinition || res.data.appSpec) {
    useAppDefinition.setState({
      appDefinition: res.data.appDefinition ?? null,
      appSpec: res.data.appSpec ?? null,
    });
  }
  storeLoadedAppConfigState(res.data.projectState);
  return true;
}

export async function resetAppDeployment(): Promise<boolean> {
  useProjectLoading.setState({
    projectIsLoading: true,
    projectIs404: false,
  });
  resetProjectStores();
  const session = await ensureAppSessionFromCurrentDeployment({
    forceNewSession: true,
  });
  if (!session) {
    useProjectLoading.setState({
      projectIsLoading: false,
      projectIs404: true,
    });
    return false;
  }
  const loaded = await loadAppDeploymentState();
  useProjectLoading.setState({
    projectIsLoading: false,
    projectIs404: !loaded,
  });
  return loaded;
}

export async function ensureAppProjectConfigLoaded(
  projectConfigId: string,
): Promise<boolean> {
  if (useAppConfigs.getState().configs[projectConfigId]) {
    return true;
  }
  return await loadAppDeploymentState({ projectConfigId });
}

function storeLoadedAppConfigState(projectState: ProjectStateSingleConfig) {
  useAppConfigs.setState((state) => ({
    configs: {
      ...state.configs,
      [projectState.projectConfig.id]: {
        ...projectState,
        previewSectionVariantMap: {},
      },
    },
  }));
}
