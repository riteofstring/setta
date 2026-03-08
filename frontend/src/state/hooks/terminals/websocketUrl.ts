import { C_ADDRESSES } from "utils/c_addresses";
import { replaceAddressParams } from "utils/endpointUtils";
import { RouteEnum } from "utils/generatedTypes";
import { GoWebsocketRoutes } from "utils/generatedGoRoutes";
import { createNewId } from "utils/idNameCreation";

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
    ? replaceAddressParams(RouteEnum.TERMINAL, {
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
