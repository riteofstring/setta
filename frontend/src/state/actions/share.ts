import { requestAIFollowSnapshot } from "state/actions/aiFollow";
import { loadProjectState } from "state/actions/project/loadProject";
import {
  useAllProjectMetadata,
  useProjectLoading,
  useShareSession,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import { res200 } from "utils/endpointUtils";
import {
  route_create_share_session,
  route_create_share_session_current,
  route_load_share_project_config,
} from "utils/generatedEndpoints";
import type { ProjectConfig } from "utils/generatedTypes";

export async function initializeShareDeployment(
  projectConfigName: string,
  deploymentVersion: string,
  requestedProjectConfigName: string | null,
): Promise<boolean> {
  resetProjectStores();
  useProjectLoading.setState({ projectIsLoading: true, projectIs404: false });

  const sessionRes = await route_create_share_session(
    projectConfigName,
    deploymentVersion,
  );
  if (!res200(sessionRes)) {
    useProjectLoading.setState({ projectIsLoading: false, projectIs404: true });
    return false;
  }

  const session = sessionRes.data;
  setShareSessionCookie(session.shareSessionId);
  useShareSession.setState({
    isShareMode: true,
    shareSessionId: session.shareSessionId,
    sharePolicy: session.sharePolicy,
    shareDeploymentName: session.projectConfigName,
    shareDeploymentVersion: session.deploymentVersion,
  });
  useAllProjectMetadata.setState({
    defaultProjectConfigId: session.defaultProjectConfigId,
    projectMetadata: session.projectMetadata,
  });

  const resolvedConfigId = resolveProjectConfigId(
    session.projectMetadata,
    requestedProjectConfigName,
    session.defaultProjectConfigId,
  );
  if (!resolvedConfigId) {
    useProjectLoading.setState({ projectIsLoading: false, projectIs404: true });
    return false;
  }

  const stateRes = await route_load_share_project_config(
    session.projectConfigName,
    session.deploymentVersion,
    { projectConfigId: resolvedConfigId },
  );
  if (!res200(stateRes)) {
    useProjectLoading.setState({ projectIsLoading: false, projectIs404: true });
    return false;
  }

  await loadProjectState(stateRes.data.projectState);
  if (session.sharePolicy.allowLLM) {
    await requestAIFollowSnapshot(resolvedConfigId);
  }
  useProjectLoading.setState({ projectIsLoading: false, projectIs404: false });
  return true;
}

export async function initializeShareSessionFromCurrentDeployment(): Promise<boolean> {
  const shareSession = useShareSession.getState();
  if (shareSession.shareSessionId) {
    return true;
  }

  const sessionRes = await route_create_share_session_current();
  if (!res200(sessionRes)) {
    return false;
  }

  const session = sessionRes.data;
  setShareSessionCookie(session.shareSessionId);
  useShareSession.setState({
    isShareMode: true,
    shareSessionId: session.shareSessionId,
    sharePolicy: session.sharePolicy,
    shareDeploymentName: session.projectConfigName,
    shareDeploymentVersion: session.deploymentVersion,
  });
  useAllProjectMetadata.setState({
    defaultProjectConfigId: session.defaultProjectConfigId,
    projectMetadata: session.projectMetadata,
  });
  return true;
}

type ShareProjectConfigLoadParams = {
  projectConfigName: string | undefined;
  deploymentVersion: string | undefined;
  projectConfigId: string;
};

export async function loadShareProjectConfig({
  projectConfigName,
  deploymentVersion,
  projectConfigId,
}: ShareProjectConfigLoadParams): Promise<boolean> {
  const shareSession = useShareSession.getState();
  if (!shareSession.isShareMode || !projectConfigName || !deploymentVersion) {
    return false;
  }

  useProjectLoading.setState({ projectIsLoading: true, projectIs404: false });
  const stateRes = await route_load_share_project_config(
    projectConfigName,
    deploymentVersion,
    { projectConfigId },
  );
  if (!res200(stateRes)) {
    useProjectLoading.setState({ projectIsLoading: false, projectIs404: true });
    return false;
  }

  await loadProjectState(stateRes.data.projectState);
  if (shareSession.sharePolicy?.allowLLM) {
    await requestAIFollowSnapshot(projectConfigId);
  }
  useProjectLoading.setState({ projectIsLoading: false, projectIs404: false });
  return true;
}

function setShareSessionCookie(shareSessionId: string) {
  document.cookie = `shareSessionId=${shareSessionId}; path=/; SameSite=Lax`;
}

function resolveProjectConfigId(
  projectMetadata: ProjectConfig[],
  requestedProjectConfigName: string | null,
  defaultProjectConfigId: string | null,
): string | null {
  if (requestedProjectConfigName) {
    for (const config of projectMetadata) {
      if (config.name === requestedProjectConfigName) {
        return config.id;
      }
    }
    return null;
  }
  return defaultProjectConfigId;
}
