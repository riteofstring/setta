import {
  BACKEND_ORIGIN_OVERRIDE_ALLOW_NON_LOCAL_STORAGE_KEY,
  BACKEND_ORIGIN_OVERRIDE_STORAGE_KEY,
} from "@setta/app-subsystem-frontend-sdk";
import { BootstrapProtocol } from "utils/generatedTypes";
import { isLocalHostname } from "utils/hostnames";
import { normalizeOrigin } from "utils/origin";
import { safeSessionStorage } from "utils/storage";

export {
  BACKEND_ORIGIN_OVERRIDE_ALLOW_NON_LOCAL_STORAGE_KEY,
  BACKEND_ORIGIN_OVERRIDE_STORAGE_KEY,
};

function allowNonLocalOriginOverride(): boolean {
  const raw = import.meta.env?.VITE_ALLOW_BACKEND_ORIGIN_OVERRIDE;
  if (typeof raw !== "string") {
    return false;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function isSameHostOrLocalPeerOverrideAllowed(
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
  return false;
}

function writeBackendOriginOverrideToStorage(
  origin: string | undefined,
  allowNonLocal = false,
): void {
  const storage = safeSessionStorage();
  if (!storage) {
    return;
  }
  try {
    if (!origin) {
      storage.removeItem(BACKEND_ORIGIN_OVERRIDE_STORAGE_KEY);
      storage.removeItem(BACKEND_ORIGIN_OVERRIDE_ALLOW_NON_LOCAL_STORAGE_KEY);
      return;
    }
    storage.setItem(BACKEND_ORIGIN_OVERRIDE_STORAGE_KEY, origin);
    if (allowNonLocal) {
      storage.setItem(
        BACKEND_ORIGIN_OVERRIDE_ALLOW_NON_LOCAL_STORAGE_KEY,
        origin,
      );
    } else {
      storage.removeItem(BACKEND_ORIGIN_OVERRIDE_ALLOW_NON_LOCAL_STORAGE_KEY);
    }
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

  if (isSameHostOrLocalPeerOverrideAllowed(override, currentOrigin)) {
    writeBackendOriginOverrideToStorage(override);
    return;
  }

  if (allowNonLocalOriginOverride()) {
    writeBackendOriginOverrideToStorage(override, true);
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

  const rawOverride = url.searchParams.get(
    BootstrapProtocol.backendOriginOverrideQueryParam,
  );
  if (!rawOverride) {
    return;
  }

  persistBackendOriginOverride(rawOverride, url.origin);
  url.searchParams.delete(BootstrapProtocol.backendOriginOverrideQueryParam);
  cleanBackendOriginOverrideFromUrl(url.toString());
}
