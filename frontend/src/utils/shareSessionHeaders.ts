import { useShareSession } from "state/definitions";

export function buildShareSessionHeaders(): Record<string, string> {
  const shareSession = useShareSession.getState();
  if (!shareSession.isDeploymentMode || !shareSession.shareSessionId) {
    return {};
  }
  return { "X-Share-Session-Id": shareSession.shareSessionId };
}
