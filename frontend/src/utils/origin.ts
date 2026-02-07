const PROTOCOL_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;

export function normalizeOrigin(
  origin: string,
  label: string = "backend origin",
): string | undefined {
  let normalizedOrigin = origin.trim();
  if (!normalizedOrigin) {
    return undefined;
  }
  const hasProtocol = PROTOCOL_RE.test(normalizedOrigin);
  if (!hasProtocol) {
    normalizedOrigin = `http://${normalizedOrigin}`;
  }
  let url: URL;
  try {
    url = new URL(normalizedOrigin);
  } catch (error) {
    console.error(`Invalid ${label} "${origin}".`, error);
    return undefined;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    console.error(
      `Invalid ${label} "${origin}". Expected an http(s) origin, got "${url.protocol}".`,
    );
    return undefined;
  }
  return url.origin;
}

