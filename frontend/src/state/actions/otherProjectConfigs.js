import { useOtherProjectConfigs } from "state/definitions/otherProjectConfigs";

export function setOtherProjectConfigs(payload) {
  useOtherProjectConfigs.setState({ x: payload });
}
