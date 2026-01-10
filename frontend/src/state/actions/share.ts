import { requestAIFollowSnapshot } from "state/actions/aiFollow";
import { loadProjectState } from "state/actions/project/loadProject";
import {
  useAllProjectMetadata,
  useProjectLoading,
  useShareSession,
} from "state/definitions";
import { res200 } from "utils/endpointUtils";
import {
  route_create_share_session_current,
  route_load_share_project_config,
} from "utils/generatedEndpoints";
import type { ShareDeploymentSessionResponse } from "utils/generatedTypes";

function getCachedShareSession(): ShareDeploymentSessionResponse | null {
  const shareSession = useShareSession.getState();
  const metadata = useAllProjectMetadata.getState();
  if (!shareSession.isShareMode) {
    return null;
  }
  if (
    !shareSession.shareSessionId ||
    !shareSession.sharePolicy ||
    !shareSession.shareDeploymentName ||
    !shareSession.shareDeploymentVersion
  ) {
    return null;
  }
  if (!metadata.defaultProjectConfigId) {
    return null;
  }
  return {
    deploymentName: shareSession.shareDeploymentName,
    deploymentVersion: shareSession.shareDeploymentVersion,
    shareSessionId: shareSession.shareSessionId,
    defaultProjectConfigId: metadata.defaultProjectConfigId,
    projectMetadata: metadata.projectMetadata,
    sharePolicy: shareSession.sharePolicy,
    manifest: null,
  };
}

function setShareSessionFromResponse(session: ShareDeploymentSessionResponse) {
  setShareSessionCookie(session.shareSessionId);
  useShareSession.setState({
    isShareMode: true,
    shareSessionId: session.shareSessionId,
    sharePolicy: session.sharePolicy,
    shareDeploymentName: session.deploymentName,
    shareDeploymentVersion: session.deploymentVersion,
  });
  useAllProjectMetadata.setState({
    defaultProjectConfigId: session.defaultProjectConfigId,
    projectMetadata: session.projectMetadata,
  });
}

export async function ensureShareSessionFromCurrentDeployment(): Promise<ShareDeploymentSessionResponse | null> {
  const cached = getCachedShareSession();
  if (cached) {
    return cached;
  }
  const sessionRes = await route_create_share_session_current();
  if (!res200(sessionRes)) {
    return null;
  }
  const session = sessionRes.data;
  setShareSessionFromResponse(session);
  return session;
}

export async function initializeShareSessionFromCurrentDeployment(): Promise<boolean> {
  const session = await ensureShareSessionFromCurrentDeployment();
  return session !== null;
}

type ShareProjectConfigLoadParams = {
  projectConfigId: string;
};

export async function loadShareProjectConfig({
  projectConfigId,
}: ShareProjectConfigLoadParams): Promise<boolean> {
  const shareSession = useShareSession.getState();
  if (
    !shareSession.isShareMode ||
    !shareSession.shareDeploymentName ||
    !shareSession.shareDeploymentVersion
  ) {
    return false;
  }

  useProjectLoading.setState({ projectIsLoading: true, projectIs404: false });
  const stateRes = await route_load_share_project_config(
    shareSession.shareDeploymentName,
    shareSession.shareDeploymentVersion,
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
