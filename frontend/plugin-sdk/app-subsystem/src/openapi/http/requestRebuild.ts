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
