import { C_ADDRESSES } from "utils/c_addresses";
import { buildShareSessionHeaders } from "utils/shareSessionHeaders";
import { buildBackendURL } from "utils/transportUrlCore";
import { client } from "./generated/client.gen";

function resolveOpenAPIBaseURL(): string {
  if (typeof location === "undefined") {
    return "http://localhost";
  }
  return C_ADDRESSES.BACKEND_ORIGIN;
}

export async function rebuildBackendRequest(
  request: Request,
  resolvedURL: string,
): Promise<Request> {
  const rebuiltInit: RequestInit = {
    method: request.method,
    headers: new Headers(request.headers),
    mode: request.mode,
    credentials: request.credentials,
    cache: request.cache,
    redirect: request.redirect,
    referrer: request.referrer,
    referrerPolicy: request.referrerPolicy,
    integrity: request.integrity,
    keepalive: request.keepalive,
    signal: request.signal,
  };

  if (
    request.body !== null &&
    request.method !== "GET" &&
    request.method !== "HEAD"
  ) {
    // Chromium can fail cross-origin POSTs with ERR_ALPN_NEGOTIATION_FAILED when
    // we rewrite the URL via `new Request(url, existingRequest)`. Rebuilding the
    // request explicitly avoids that browser bug while preserving the payload.
    rebuiltInit.body = await request.clone().arrayBuffer();
  }

  return new Request(resolvedURL, rebuiltInit);
}

async function fetchOpenAPIRequest(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const request = input instanceof Request ? input : new Request(input, init);
  const requestURL = new URL(request.url);
  const resolvedURL = buildBackendURL(
    `${requestURL.pathname}${requestURL.search}`,
  );
  const nextRequest = await rebuildBackendRequest(request, resolvedURL);
  const shareHeaders = buildShareSessionHeaders();
  for (const [key, value] of Object.entries(shareHeaders)) {
    nextRequest.headers.set(key, value);
  }
  return await fetch(nextRequest);
}

client.setConfig({
  baseUrl: resolveOpenAPIBaseURL(),
  credentials: "include",
  responseStyle: "fields",
  fetch: fetchOpenAPIRequest,
});
