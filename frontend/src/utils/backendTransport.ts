import { buildBackendURL as buildBackendURLInternal } from "./endpointUtils";

export function buildBackendURL(
  address: string,
  addressParams?: Record<string, string | number | boolean | null | undefined>,
): string {
  return buildBackendURLInternal(address, addressParams);
}
