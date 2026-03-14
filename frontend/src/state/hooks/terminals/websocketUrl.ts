import { buildBackendOriginWebsocketURL } from "utils/endpointUtils";
import { GoWebsocketRouteHelpers } from "utils/generatedRoutes";

export type BuildTerminalWebsocketUrlOptions = {
  projectConfigId: string;
  sectionId: string;
  shareSessionId: string | null;
};

export function buildTerminalWebsocketUrl({
  projectConfigId,
  sectionId,
  shareSessionId,
}: BuildTerminalWebsocketUrlOptions): string {
  return buildBackendOriginWebsocketURL(
    GoWebsocketRouteHelpers.terminalBySection(projectConfigId, sectionId),
    {
      shareSessionId: shareSessionId ?? undefined,
    },
  );
}
