import { normalizeOrigin } from "utils/origin";
import { safeSessionStorage } from "utils/storage";

export const BACKEND_ORIGIN_OVERRIDE_STORAGE_KEY =
  "setta.backendOriginOverride";
const BACKEND_ORIGIN_OVERRIDE_QUERY_PARAM = "__setta_backend_origin";

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
