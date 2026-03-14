import { buildBackendOriginURL as buildBackendOriginURLInternal } from "./endpointUtils";

export function buildBackendOriginURL(
  address: string,
  addressParams?: Record<string, string | number | boolean | null | undefined>,
): string {
  return buildBackendOriginURLInternal(address, addressParams);
}

export function buildBackendOriginWebsocketURL(
  address: string,
  addressParams?: Record<string, string | number | boolean | null | undefined>,
): string {
  const url = new URL(buildBackendOriginURLInternal(address, addressParams));
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}
