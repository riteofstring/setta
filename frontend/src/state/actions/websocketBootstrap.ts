import { buildFrontendAffinityCurrentAddress } from "state/actions/frontendWebsocketAffinity";
import { processLspDiagnostics } from "state/actions/lspDiagnosticsState";
import { addTemporaryNotification } from "state/actions/notifications";
import { addWebsocketConnection } from "state/actions/websocketConnectionList";
import { NULL_PROJECT_CONFIG_ID } from "state/definitions";
import { res200 } from "utils/endpointUtils";
import {
  route_get_latest_lsp_diagnostics,
  route_get_latest_project_state,
} from "utils/generatedEndpoints";
import {
  WebsocketConnectionTypeEnum,
  createWebsocketConnectionInfo,
} from "utils/generatedTypes";
import { loadAgentRuns } from "./aiAgentRuns";
import { requestAIFollowSnapshot } from "./aiFollow";
import { fetchListenerCoverageSnapshot } from "./listenerCoverage";
import { getCurrProjectConfigId } from "./sectionEffectiveImplSelectors";
import { processProjectStateUpdateFromBackend } from "./sectionProjectStateSync";

export async function bootstrapSocketOpen({
  pathname,
  shareSessionId,
  isDeploymentMode,
  sendCurrentAddress,
  startShareHeartbeat,
  startAuthRefresh,
}: {
  pathname: string;
  shareSessionId: string | null;
  isDeploymentMode: boolean;
  sendCurrentAddress: (currentAddress: string) => void;
  startShareHeartbeat: () => void;
  startAuthRefresh: (options: { runImmediately: boolean }) => void;
}): Promise<void> {
  sendCurrentAddress(buildFrontendAffinityCurrentAddress(pathname));
  addTemporaryNotification("Connected to server");
  addWebsocketConnection(
    createWebsocketConnectionInfo({
      id: "main",
      connectionType: WebsocketConnectionTypeEnum.SERVER,
      currentAddress: pathname,
      shareSessionId,
    }),
  );
  if (isDeploymentMode) {
    startShareHeartbeat();
    const projectConfigId = getCurrProjectConfigId();
    if (projectConfigId !== NULL_PROJECT_CONFIG_ID) {
      await fetchListenerCoverageSnapshot(projectConfigId);
    }
    return;
  }

  const projectConfigId = getCurrProjectConfigId();
  const hydrated = await hydrateLatestProjectState(projectConfigId);
  startAuthRefresh({ runImmediately: !hydrated });
}

export async function hydrateLatestProjectState(
  projectConfigId: string,
): Promise<boolean> {
  if (projectConfigId === NULL_PROJECT_CONFIG_ID) {
    return false;
  }
  const res = await route_get_latest_project_state({
    projectConfigId,
  });
  if (!res200(res)) {
    return false;
  }
  processProjectStateUpdateFromBackend(res.data);
  void loadAgentRuns();
  await requestAIFollowSnapshot(projectConfigId);
  const diagnosticsRes = await route_get_latest_lsp_diagnostics({
    projectConfigId,
  });
  if (res200(diagnosticsRes)) {
    processLspDiagnostics(diagnosticsRes.data);
  }
  return true;
}
