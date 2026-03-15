import { processAppProjectStateUpdateFromBackend } from "state/actions/appProjectState";
import { useServerMode } from "state/stores/sessionStores";

import { processProjectStateUpdateFromBackend } from "./sectionProjectStateSync";

type FrontendProjectStateUpdate = Parameters<
  typeof processProjectStateUpdateFromBackend
>[0];

export function handleIncomingProjectStateSnapshot(
  content: FrontendProjectStateUpdate,
): void {
  if (useServerMode.getState().mode === "app") {
    processAppProjectStateUpdateFromBackend(content);
    return;
  }
  processProjectStateUpdateFromBackend(content);
}
