import {
  buildBackendOriginURL as buildBackendOriginURLInternal,
  buildBackendOriginWebsocketURL as buildBackendOriginWebsocketURLInternal,
} from "./transportUrlCore";

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
  return buildBackendOriginWebsocketURLInternal(address, addressParams);
}
