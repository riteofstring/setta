import { requestAIFollowSnapshot } from "state/actions/aiFollow";
import { loadProjectState } from "state/actions/project/loadProject";
import { useProjectLoading } from "state/stores/projectStatusStores";
import { useShareSession } from "state/stores/sessionStores";
import { res200 } from "utils/endpointUtils";
import { route_load_share_project_config } from "utils/generatedEndpoints";
import { ensureShareSessionFromCurrentDeployment } from "./shareSessionState";

type ShareProjectConfigLoadParams = {
  projectConfigId: string;
  allowRetry?: boolean;
};

export async function loadShareProjectConfig({
  projectConfigId,
  allowRetry = true,
}: ShareProjectConfigLoadParams): Promise<boolean> {
  const shareSession = useShareSession.getState();
  if (
    !shareSession.isDeploymentMode ||
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
    if (allowRetry && stateRes.status === 404) {
      const session = await ensureShareSessionFromCurrentDeployment({
        forceNewSession: true,
      });
      if (session) {
        return await loadShareProjectConfig({
          projectConfigId,
          allowRetry: false,
        });
      }
    }
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
