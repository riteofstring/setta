import { BootstrapProtocol } from "utils/generatedTypes";
import { isLocalHostname } from "utils/hostnames";
import { normalizeOrigin } from "utils/origin";
import { safeSessionStorage } from "utils/storage";

function launcherOriginStorage(): Storage | undefined {
  return safeSessionStorage();
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
    const raw = storage.getItem(BootstrapProtocol.launcherOriginStorageKey);
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
        storage.removeItem(BootstrapProtocol.launcherOriginStorageKey);
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
    storage.setItem(BootstrapProtocol.launcherOriginStorageKey, normalized);
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
