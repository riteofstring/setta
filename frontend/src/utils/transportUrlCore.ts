import { useServerMode } from "state/definitions";
import { C_ADDRESSES } from "./c_addresses";
import {
  type EndpointOrigin,
  resolveEndpointOriginForMode,
} from "./serverModeBoundaryPolicy";

function resolveEndpointOrigin(address: string): EndpointOrigin {
  return resolveEndpointOriginForMode(address, useServerMode.getState().mode);
}

function resolveBackendUrl(address: string): string {
  const originPolicy = resolveEndpointOrigin(address);
  if (originPolicy === "backend-origin") {
    return `${C_ADDRESSES.BACKEND_ORIGIN}${address}`;
  }
  if (originPolicy === "launcher") {
    return `${C_ADDRESSES.LAUNCHER}${address}`;
  }
  return `${C_ADDRESSES.BACKEND}${address}`;
}

function replaceAddressParams(
  address: string,
  addressParams?: Record<string, string | number | boolean | null | undefined>,
): string {
  if (!addressParams) {
    return address;
  }

  let output = address;
  for (const [key, value] of Object.entries(addressParams)) {
    const regex = new RegExp(`\\{${key}\\}`, "g");
    output = output.replace(regex, String(value));
  }
  return output;
}

function buildAddressWithParams(
  address: string,
  addressParams?: Record<string, string | number | boolean | null | undefined>,
): string {
  if (!addressParams) {
    return address;
  }

  const pathParamMatches = Array.from(address.matchAll(/\{([^}]+)\}/g));
  const pathParamKeys = new Set(pathParamMatches.map((match) => match[1]));
  const pathParams: Record<
    string,
    string | number | boolean | null | undefined
  > = {};
  const queryParams = new URLSearchParams();

  for (const [key, value] of Object.entries(addressParams)) {
    if (pathParamKeys.has(key)) {
      pathParams[key] = value;
      continue;
    }
    if (value === null || value === undefined) {
      continue;
    }
    queryParams.append(key, String(value));
  }

  const pathAddress = replaceAddressParams(address, pathParams);
  const encodedQuery = queryParams.toString();
  if (encodedQuery.length === 0) {
    return pathAddress;
  }
  const joiner = pathAddress.includes("?") ? "&" : "?";
  return `${pathAddress}${joiner}${encodedQuery}`;
}

export function buildBackendURL(
  address: string,
  addressParams?: Record<string, string | number | boolean | null | undefined>,
): string {
  return resolveBackendUrl(buildAddressWithParams(address, addressParams));
}

export function buildBackendOriginURL(
  address: string,
  addressParams?: Record<string, string | number | boolean | null | undefined>,
): string {
  return `${C_ADDRESSES.BACKEND_ORIGIN}${buildAddressWithParams(
    address,
    addressParams,
  )}`;
}

export function buildBackendOriginWebsocketURL(
  address: string,
  addressParams?: Record<string, string | number | boolean | null | undefined>,
): string {
  const url = new URL(buildBackendOriginURL(address, addressParams));
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}
