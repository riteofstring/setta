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

async function fetchOpenAPIRequest(request: Request): Promise<Response> {
  const requestURL = new URL(request.url);
  const resolvedURL = buildBackendURL(
    `${requestURL.pathname}${requestURL.search}`,
  );
  const nextRequest = new Request(resolvedURL, request);
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
