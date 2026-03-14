import { buildBackendURL as buildBackendURLInternal } from "./transportUrlCore";

export function buildBackendURL(
  address: string,
  addressParams?: Record<string, string | number | boolean | null | undefined>,
): string {
  return buildBackendURLInternal(address, addressParams);
}
