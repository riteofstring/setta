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

async function fetchOpenAPIRequest(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const request = input instanceof Request ? input : new Request(input, init);
  const requestURL = new URL(request.url);
  const resolvedURL = buildBackendURL(
    `${requestURL.pathname}${requestURL.search}`,
  );
  const body =
    request.body === null ? undefined : await request.clone().arrayBuffer();
  const nextRequest = new Request(resolvedURL, {
    method: request.method,
    headers: request.headers,
    body,
    credentials: request.credentials,
    cache: request.cache,
    mode: request.mode,
    redirect: request.redirect,
    referrer: request.referrer,
    referrerPolicy: request.referrerPolicy,
    integrity: request.integrity,
    keepalive: request.keepalive,
    signal: request.signal,
  });
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
