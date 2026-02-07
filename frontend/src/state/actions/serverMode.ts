import { ensureAppSessionFromCurrentDeployment } from "state/actions/app";
import { ensureShareSessionFromCurrentDeployment } from "state/actions/share";
import { useServerMode } from "state/definitions";

export async function initializeServerMode(): Promise<"ide" | "share" | "app"> {
  const serverMode = useServerMode.getState();
  if (serverMode.modeResolved) {
    return serverMode.mode;
  }

  const appSession = await ensureAppSessionFromCurrentDeployment();
  if (appSession) {
    return "app";
  }

  const shareSession = await ensureShareSessionFromCurrentDeployment();
  if (shareSession) {
    return "share";
  }

  useServerMode.setState({ mode: "ide", modeResolved: true });
  return "ide";
}
