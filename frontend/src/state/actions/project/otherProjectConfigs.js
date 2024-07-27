import { useOtherProjectConfigs } from "state/definitions";

export function setOtherProjectConfigs(payload) {
  useOtherProjectConfigs.setState({ x: payload });
}
