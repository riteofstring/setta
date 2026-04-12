import { BootstrapProtocol } from "utils/generatedTypes";
import { isLocalHostname } from "utils/hostnames";
import { normalizeOrigin } from "utils/origin";
import { safeSessionStorage } from "utils/storage";

export const BACKEND_ORIGIN_OVERRIDE_STORAGE_KEY =
  "setta.backendOriginOverride";
const BACKEND_ORIGIN_OVERRIDE_QUERY_PARAM =
  BootstrapProtocol.backendOriginOverrideQueryParam;

function allowNonLocalOriginOverride(): boolean {
  const raw = import.meta.env?.VITE_ALLOW_BACKEND_ORIGIN_OVERRIDE;
  if (typeof raw !== "string") {
    return false;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
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

function getCurrentWindowUrl(): URL | undefined {
  if (typeof window === "undefined") {
    return;
  }
  try {
    return new URL(window.location.href);
  } catch {
    return;
  }
}

function persistBackendOriginOverride(
  rawOverride: string,
  currentOrigin: string,
): void {
  if (!import.meta.env?.DEV) {
    return;
  }

  const override = normalizeOrigin(rawOverride, "backend origin");
  if (!override) {
    return;
  }

  if (isOverrideAllowed(override, currentOrigin)) {
    writeBackendOriginOverrideToStorage(override);
    return;
  }

  console.warn(
    "Ignoring backend origin override due to hostname mismatch. Set VITE_ALLOW_BACKEND_ORIGIN_OVERRIDE=1 to allow.",
  );
}

function replaceHistoryUrl(nextUrl: string): boolean {
  try {
    window.history.replaceState(window.history.state, "", nextUrl);
    return true;
  } catch {
    // Some browsers/extensions can leave a non-cloneable state in history.state.
    // Falling back to null is better than leaving the handoff URL behind.
  }

  try {
    window.history.replaceState(null, "", nextUrl);
    return true;
  } catch (error) {
    console.warn("Failed to clean backend origin override from URL", error);
    return false;
  }
}

function cleanBackendOriginOverrideFromUrl(nextUrl: string): void {
  if (replaceHistoryUrl(nextUrl)) {
    return;
  }

  try {
    window.location.replace(nextUrl);
  } catch {
    // ignore
  }
}

export function applyBackendOriginOverrideFromUrl(): void {
  const url = getCurrentWindowUrl();
  if (!url) {
    return;
  }

  const rawOverride = url.searchParams.get(BACKEND_ORIGIN_OVERRIDE_QUERY_PARAM);
  if (!rawOverride) {
    return;
  }

  persistBackendOriginOverride(rawOverride, url.origin);
  url.searchParams.delete(BACKEND_ORIGIN_OVERRIDE_QUERY_PARAM);
  cleanBackendOriginOverrideFromUrl(url.toString());
}
