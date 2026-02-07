import { normalizeOrigin } from "utils/origin";
import { safeSessionStorage } from "utils/storage";

export const LAUNCHER_ORIGIN_STORAGE_KEY = "setta.launcherOrigin";

function safeLocalStorage(): Storage | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function launcherOriginStorage(): Storage | undefined {
  return import.meta.env?.DEV ? safeSessionStorage() : safeLocalStorage();
}

export function readLauncherOrigin(): string | undefined {
  const storage = launcherOriginStorage();
  if (!storage) {
    return undefined;
  }
  try {
    const raw = storage.getItem(LAUNCHER_ORIGIN_STORAGE_KEY);
    if (!raw) {
      return undefined;
    }
    return normalizeOrigin(raw, "launcher origin") ?? undefined;
  } catch {
    return undefined;
  }
}

export function writeLauncherOrigin(origin: string): void {
  const storage = launcherOriginStorage();
  if (!storage) {
    return;
  }
  const normalized = normalizeOrigin(origin, "launcher origin");
  if (!normalized) {
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
