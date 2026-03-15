import { useShareSession } from "state/stores/sessionStores";

import {
  readAppSessionFromStorage,
  storeAppSession,
} from "./appSessionStoredState";

export function incrementAppSessionRunCount(): void {
  const shareSession = useShareSession.getState();
  if (!shareSession.isDeploymentMode || shareSession.deploymentMode !== "app") {
    return;
  }
  const nextCount = shareSession.sessionRunCount + 1;
  useShareSession.setState({ sessionRunCount: nextCount });
  const stored = readAppSessionFromStorage();
  if (!stored) {
    return;
  }
  storeAppSession({ ...stored, sessionRunCount: nextCount });
}
