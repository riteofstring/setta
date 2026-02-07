import { normalizeOrigin } from "utils/origin";
import { safeSessionStorage } from "utils/storage";

export const BACKEND_ORIGIN_OVERRIDE_STORAGE_KEY =
  "setta.backendOriginOverride";
const BACKEND_ORIGIN_OVERRIDE_QUERY_PARAM = "__setta_backend_origin";

function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1"
  );
}

function allowNonLocalOriginOverride(): boolean {
  const raw = import.meta.env?.VITE_ALLOW_BACKEND_ORIGIN_OVERRIDE;
  if (!raw) {
    return false;
  }
  if (typeof raw === "boolean") {
    return raw;
  }
  if (typeof raw === "string") {
    const normalized = raw.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes";
  }
  return false;
}

function isOverrideAllowed(
  overrideOrigin: string,
  currentOrigin: string,
): boolean {
  let overrideUrl: URL;
  let currentUrl: URL;
  try {
    overrideUrl = new URL(overrideOrigin);
    currentUrl = new URL(currentOrigin);
  } catch {
    return false;
  }
  if (overrideUrl.hostname === currentUrl.hostname) {
    return true;
  }
  if (
    isLocalHostname(overrideUrl.hostname) &&
    isLocalHostname(currentUrl.hostname)
  ) {
    return true;
  }
  return allowNonLocalOriginOverride();
}

function writeBackendOriginOverrideToStorage(origin: string | undefined): void {
  const storage = safeSessionStorage();
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

  const override = normalizeOrigin(rawOverride, "backend origin");
  if (override && isOverrideAllowed(override, url.origin)) {
    writeBackendOriginOverrideToStorage(override);
  } else if (override) {
    console.warn(
      "Ignoring backend origin override due to hostname mismatch. Set VITE_ALLOW_BACKEND_ORIGIN_OVERRIDE=1 to allow.",
    );
  }
  url.searchParams.delete(BACKEND_ORIGIN_OVERRIDE_QUERY_PARAM);

  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  try {
    window.history.replaceState(window.history.state, "", nextUrl);
  } catch (error) {
    console.warn("Failed to clean backend origin override from URL", error);
  }
}
