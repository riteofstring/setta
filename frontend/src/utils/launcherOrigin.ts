import { normalizeOrigin } from "utils/origin";
import { isLocalHostname } from "utils/hostnames";
import { safeLocalStorage, safeSessionStorage } from "utils/storage";

const LAUNCHER_ORIGIN_STORAGE_KEY = "setta.launcherOrigin";

function launcherOriginStorage(): Storage | undefined {
  return import.meta.env?.DEV ? safeSessionStorage() : safeLocalStorage();
}

function isLauncherOriginAllowed(
  launcherOrigin: string,
  currentOrigin: string,
): boolean {
  let launcherUrl: URL;
  let currentUrl: URL;
  try {
    launcherUrl = new URL(launcherOrigin);
    currentUrl = new URL(currentOrigin);
  } catch {
    return false;
  }
  if (launcherUrl.hostname === currentUrl.hostname) {
    return true;
  }
  return (
    isLocalHostname(launcherUrl.hostname) &&
    isLocalHostname(currentUrl.hostname)
  );
}

function readLauncherOrigin(): string | undefined {
  const storage = launcherOriginStorage();
  if (!storage) {
    return undefined;
  }
  try {
    const raw = storage.getItem(LAUNCHER_ORIGIN_STORAGE_KEY);
    if (!raw) {
      return undefined;
    }
    const normalized = normalizeOrigin(raw, "launcher origin");
    if (!normalized) {
      return undefined;
    }
    if (
      typeof window !== "undefined" &&
      !isLauncherOriginAllowed(normalized, window.location.origin)
    ) {
      try {
        storage.removeItem(LAUNCHER_ORIGIN_STORAGE_KEY);
      } catch {
        // Ignore storage failures.
      }
      return undefined;
    }
    return normalized;
  } catch {
    return undefined;
  }
}

function writeLauncherOrigin(origin: string): void {
  const storage = launcherOriginStorage();
  if (!storage) {
    return;
  }
  const normalized = normalizeOrigin(origin, "launcher origin");
  if (!normalized) {
    return;
  }
  if (
    typeof window !== "undefined" &&
    !isLauncherOriginAllowed(normalized, window.location.origin)
  ) {
    return;
  }
  try {
    storage.setItem(LAUNCHER_ORIGIN_STORAGE_KEY, normalized);
  } catch {
    // Ignore storage failures.
  }
}

export function getOrInitLauncherOrigin(fallbackOrigin: string): string {
  const existing = readLauncherOrigin();
  if (existing) {
    return existing;
  }
  const normalized = normalizeOrigin(fallbackOrigin, "launcher origin");
  const resolved = normalized ?? fallbackOrigin;
  writeLauncherOrigin(resolved);
  return resolved;
}

export function appendLauncherOriginToBootstrapUrlFragment(
  bootstrapUrlFragment: string,
  launcherOrigin: string,
): string {
  if (typeof window === "undefined") {
    return bootstrapUrlFragment;
  }
  const normalized = normalizeOrigin(launcherOrigin, "launcher origin");
  if (!normalized) {
    return bootstrapUrlFragment;
  }
  let url: URL;
  try {
    url = new URL(bootstrapUrlFragment, window.location.href);
  } catch {
    return bootstrapUrlFragment;
  }
  const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
  const params = new URLSearchParams(hash);
  params.set("lo", normalized);
  url.hash = params.toString();
  return url.toString();
}
