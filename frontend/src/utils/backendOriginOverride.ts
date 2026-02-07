export const BACKEND_ORIGIN_OVERRIDE_STORAGE_KEY =
  "setta.backendOriginOverride";
const BACKEND_ORIGIN_OVERRIDE_QUERY_PARAM = "__setta_backend_origin";

function resolveStorage(): Storage | undefined {
  if (typeof sessionStorage !== "undefined") {
    return sessionStorage;
  }
  if (typeof window === "undefined") {
    return undefined;
  }
  if (typeof window.sessionStorage === "undefined") {
    return undefined;
  }
  return window.sessionStorage;
}

export function normalizeOrigin(origin: string): string | undefined {
  let normalizedOrigin = origin.trim();
  if (!normalizedOrigin) {
    return undefined;
  }
  const hasProtocol = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(normalizedOrigin);
  if (!hasProtocol) {
    normalizedOrigin = `http://${normalizedOrigin}`;
  }
  try {
    return new URL(normalizedOrigin).origin;
  } catch (error) {
    console.error(`Invalid backend origin "${origin}".`, error);
    return undefined;
  }
}

export function readBackendOriginOverrideFromStorage(): string | undefined {
  const storage = resolveStorage();
  if (!storage) {
    return undefined;
  }
  try {
    const raw = storage.getItem(BACKEND_ORIGIN_OVERRIDE_STORAGE_KEY);
    if (!raw) {
      return undefined;
    }
    return normalizeOrigin(raw);
  } catch (error) {
    console.warn(
      "Failed to read backend origin override from sessionStorage",
      error,
    );
    return undefined;
  }
}

function writeBackendOriginOverrideToStorage(origin: string | undefined): void {
  const storage = resolveStorage();
  if (!storage) {
    return;
  }
  try {
    if (!origin) {
      storage.removeItem(BACKEND_ORIGIN_OVERRIDE_STORAGE_KEY);
      return;
    }
    storage.setItem(BACKEND_ORIGIN_OVERRIDE_STORAGE_KEY, origin);
  } catch (error) {
    console.warn(
      "Failed to store backend origin override in sessionStorage",
      error,
    );
  }
}

export function applyBackendOriginOverrideFromUrl(): void {
  if (typeof window === "undefined") {
    return;
  }
  if (!import.meta.env?.DEV) {
    return;
  }

  let url: URL;
  try {
    url = new URL(window.location.href);
  } catch {
    return;
  }

  const rawOverride = url.searchParams.get(BACKEND_ORIGIN_OVERRIDE_QUERY_PARAM);
  if (!rawOverride) {
    return;
  }

  const override = normalizeOrigin(rawOverride);
  if (override) {
    writeBackendOriginOverrideToStorage(override);
  }
  url.searchParams.delete(BACKEND_ORIGIN_OVERRIDE_QUERY_PARAM);

  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  try {
    window.history.replaceState({}, "", nextUrl);
  } catch (error) {
    console.warn("Failed to clean backend origin override from URL", error);
  }
}
