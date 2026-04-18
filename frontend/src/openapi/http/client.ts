import { C_ADDRESSES } from "utils/c_addresses";
import { buildShareSessionHeaders } from "utils/shareSessionHeaders";
import { buildBackendURL } from "utils/transportUrlCore";
import { client } from "./generated/client.gen";

function requestMethodSupportsBody(method: string): boolean {
  const normalizedMethod = method.trim().toUpperCase();
  return normalizedMethod !== "GET" && normalizedMethod !== "HEAD";
}

async function buildResolvedRequest(
  request: Request,
  resolvedURL: string,
): Promise<Request> {
  const headers = new Headers(request.headers);
  const init: RequestInit = {
    method: request.method,
    headers,
    cache: request.cache,
    credentials: request.credentials,
    integrity: request.integrity,
    keepalive: request.keepalive,
    mode: request.mode,
    redirect: request.redirect,
    referrer: request.referrer,
    referrerPolicy: request.referrerPolicy,
    signal: request.signal,
  };
  if (requestMethodSupportsBody(request.method)) {
    // Chromium can fail body-carrying cross-origin rewrites when cloning a
    // Request directly into another Request with a new URL.
    init.body = await request.clone().arrayBuffer();
  }
  return new Request(resolvedURL, init);
}

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
  const nextRequest = await buildResolvedRequest(request, resolvedURL);
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
