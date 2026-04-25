import { BootstrapProtocol } from "./generatedTypes";
import { normalizeOrigin } from "./origin";
import { isSameHostOrLocalPeerOriginAllowed } from "./originPolicy";
import { safeSessionStorage } from "./storage";

function currentWindowOrigin(): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  return window.location?.origin;
}

function readLauncherOrigin(storageKey: string): string | undefined {
  const storage = safeSessionStorage();
  if (!storage) {
    return undefined;
  }
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) {
      return undefined;
    }
    const normalized = normalizeOrigin(raw, "launcher origin");
    if (!normalized) {
      return undefined;
    }
    const currentOrigin = currentWindowOrigin();
    if (
      currentOrigin &&
      !isSameHostOrLocalPeerOriginAllowed(normalized, currentOrigin)
    ) {
      try {
        storage.removeItem(storageKey);
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

function writeLauncherOrigin(origin: string, storageKey: string): void {
  const storage = safeSessionStorage();
  if (!storage) {
    return;
  }
  const normalized = normalizeOrigin(origin, "launcher origin");
  if (!normalized) {
    return;
  }
  const currentOrigin = currentWindowOrigin();
  if (
    currentOrigin &&
    !isSameHostOrLocalPeerOriginAllowed(normalized, currentOrigin)
  ) {
    return;
  }
  try {
    storage.setItem(storageKey, normalized);
  } catch {
    // Ignore storage failures.
  }
}

export function getOrInitLauncherOriginWithStorageKey(
  fallbackOrigin: string,
  storageKey: string,
): string {
  const existing = readLauncherOrigin(storageKey);
  if (existing) {
    return existing;
  }
  const normalized = normalizeOrigin(fallbackOrigin, "launcher origin");
  const resolved = normalized ?? fallbackOrigin;
  writeLauncherOrigin(resolved, storageKey);
  return resolved;
}

export function getOrInitLauncherOrigin(fallbackOrigin: string): string {
  return getOrInitLauncherOriginWithStorageKey(
    fallbackOrigin,
    BootstrapProtocol.launcherOriginStorageKey,
  );
}
