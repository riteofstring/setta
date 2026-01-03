import { requestAIFollowSnapshot } from "state/actions/aiFollow";
import { loadProjectState } from "state/actions/project/loadProject";
import { useProjectLoading, useShareSession } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { res200 } from "utils/endpointUtils";
import {
  route_create_share_session,
  route_get_share_deployment_state,
} from "utils/generatedEndpoints";

export async function initializeShareDeployment(
  deploymentId: string,
): Promise<boolean> {
  resetProjectStores();
  useProjectLoading.setState({ projectIsLoading: true, projectIs404: false });

  const sessionRes = await route_create_share_session(deploymentId);
  if (!res200(sessionRes)) {
    useProjectLoading.setState({ projectIsLoading: false, projectIs404: true });
    return false;
  }

  const session = sessionRes.data;
  setShareSessionCookie(session.shareSessionId);
  useShareSession.setState({
    isShareMode: true,
    deploymentId,
    shareSessionId: session.shareSessionId,
    projectConfigId: session.projectConfigId,
    sharePolicy: session.sharePolicy,
    manifest: session.manifest,
  });

  const stateRes = await route_get_share_deployment_state(deploymentId);
  if (!res200(stateRes)) {
    useProjectLoading.setState({ projectIsLoading: false, projectIs404: true });
    return false;
  }

  await loadProjectState(stateRes.data.projectState);
  if (session.sharePolicy.allowLLM) {
    await requestAIFollowSnapshot(session.projectConfigId);
  }
  useProjectLoading.setState({ projectIsLoading: false, projectIs404: false });
  return true;
}

function setShareSessionCookie(shareSessionId: string) {
  document.cookie = `shareSessionId=${shareSessionId}; path=/; SameSite=Lax`;
}
