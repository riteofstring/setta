import { C_ADDRESSES } from "utils/c_addresses";
import { replaceAddressParams } from "utils/endpointUtils";
import { GoWebsocketRoutes } from "utils/generatedRoutes";
import { createNewId } from "utils/idNameCreation";

const LEGACY_DEPLOYMENT_TERMINAL_WEBSOCKET_ROUTE =
  "/{projectConfigId}/{sectionId}/{id}";

export type BuildTerminalWebsocketUrlOptions = {
  projectConfigId: string;
  sectionId: string;
  shareSessionId: string | null;
  isDeploymentMode: boolean;
  legacyClientID?: string;
};

export function buildTerminalWebsocketUrl({
  projectConfigId,
  sectionId,
  shareSessionId,
  isDeploymentMode,
  legacyClientID,
}: BuildTerminalWebsocketUrlOptions): string {
  // Go terminal transport is intentionally IDE-only for now. Deployment/share
  // terminal viewing still uses the legacy websocket route until that policy
  // boundary is reopened in Go.
  const routePath = isDeploymentMode
    ? replaceAddressParams(LEGACY_DEPLOYMENT_TERMINAL_WEBSOCKET_ROUTE, {
        projectConfigId,
        sectionId,
        id: legacyClientID ?? createNewId(),
      })
    : replaceAddressParams(GoWebsocketRoutes.terminalBySection, {
        projectID: projectConfigId,
        sectionID: sectionId,
      });

  const url = new URL(`${C_ADDRESSES.WEBSOCKET}${routePath}`);
  if (shareSessionId) {
    url.searchParams.set("shareSessionId", shareSessionId);
  }
  return url.toString();
}
