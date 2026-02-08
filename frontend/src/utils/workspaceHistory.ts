import { decodeBase64Url, encodeBase64Url } from "utils/base64Url";
import {
  normalizeSettaFilesLocation,
  type SettaFilesLocation,
} from "utils/settaFilesLocation";
import { safeLocalStorage } from "utils/storage";

export type WorkspaceHistoryEntry = {
  workspaceRoot: string;
  sshTarget: string | null;
  localPort: number | null;
  settaFilesLocation: SettaFilesLocation;
  lastUsedAt: number;
};

const HISTORY_KEY = "setta.workspaceHistory";
const HISTORY_HANDOFF_KEY = "setta.workspaceHistoryHandoff";
const HISTORY_LIMIT = 6;

function normalizeNullableString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizePathLike(value: string): string {
  let output = value.trim();
  while (output.length > 1 && (output.endsWith("/") || output.endsWith("\\"))) {
    if (/^[A-Za-z]:[\\/]$/.test(output)) {
      break;
    }
    output = output.slice(0, -1);
  }
  return output;
}

function normalizeNullablePathLike(value: unknown): string | null {
  const normalized = normalizeNullableString(value);
  if (normalized === null) {
    return null;
  }
  const trimmed = normalizePathLike(normalized);
  return trimmed || null;
}

function normalizeNullablePort(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return null;
    }
    const port = Math.trunc(value);
    if (port < 1 || port > 65535) {
      return null;
    }
    return port;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
      return null;
    }
    if (parsed < 1 || parsed > 65535) {
      return null;
    }
    return parsed;
  }
  return null;
}

function buildEntryKey(entry: {
  workspaceRoot: string;
  sshTarget: string | null;
  settaFilesLocation: SettaFilesLocation;
}) {
  const normalized = {
    workspaceRoot: normalizePathLike(entry.workspaceRoot),
    sshTarget: normalizeNullableString(entry.sshTarget),
    settaFilesLocation: normalizeSettaFilesLocation(entry.settaFilesLocation),
  };
  return JSON.stringify(normalized);
}

export function workspaceHistoryEntryKey(entry: WorkspaceHistoryEntry): string {
  return buildEntryKey(entry);
}

function parseValidEntries(raw: unknown): WorkspaceHistoryEntry[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const output: WorkspaceHistoryEntry[] = [];
  for (const candidate of raw) {
    if (!candidate || typeof candidate !== "object") {
      continue;
    }
    const record = candidate as {
      workspaceRoot?: unknown;
      sshTarget?: unknown;
      localPort?: unknown;
      settaFilesLocation?: unknown;
      lastUsedAt?: unknown;
    };
    if (typeof record.workspaceRoot !== "string") {
      continue;
    }
    const normalizedWorkspaceRoot = normalizeNullablePathLike(
      record.workspaceRoot,
    );
    if (!normalizedWorkspaceRoot) {
      continue;
    }
    if (
      typeof record.lastUsedAt !== "number" ||
      !Number.isFinite(record.lastUsedAt)
    ) {
      continue;
    }
    output.push({
      workspaceRoot: normalizedWorkspaceRoot,
      sshTarget: normalizeNullableString(record.sshTarget),
      localPort: normalizeNullablePort(record.localPort),
      settaFilesLocation: normalizeSettaFilesLocation(
        record.settaFilesLocation,
      ),
      lastUsedAt: record.lastUsedAt,
    });
  }
  return output;
}

export function loadWorkspaceHistory(): WorkspaceHistoryEntry[] {
  const storage = safeLocalStorage();
  if (!storage) {
    return [];
  }
  try {
    const raw = storage.getItem(HISTORY_KEY);
    if (!raw) {
      return [];
    }
    return parseValidEntries(JSON.parse(raw));
  } catch (error) {
    console.warn("Failed to read workspace history", error);
    return [];
  }
}

export function saveWorkspaceHistory(entries: WorkspaceHistoryEntry[]) {
  const storage = safeLocalStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(HISTORY_KEY, JSON.stringify(entries));
  } catch (error) {
    console.warn("Failed to save workspace history", error);
  }
}

export function upsertWorkspaceHistoryEntry(
  existing: WorkspaceHistoryEntry[],
  nextEntry: WorkspaceHistoryEntry,
): WorkspaceHistoryEntry[] {
  const nextKey = buildEntryKey(nextEntry);
  const deduped = existing.filter((entry) => buildEntryKey(entry) !== nextKey);
  const merged = [nextEntry, ...deduped].slice(0, HISTORY_LIMIT);
  saveWorkspaceHistory(merged);
  return merged;
}

function mergeWorkspaceHistoryEntries(
  incoming: WorkspaceHistoryEntry[],
  existing: WorkspaceHistoryEntry[],
): WorkspaceHistoryEntry[] {
  const merged = new Map<string, WorkspaceHistoryEntry>();
  for (const entry of [...incoming, ...existing]) {
    let key: string;
    try {
      key = buildEntryKey(entry);
    } catch {
      continue;
    }
    const previous = merged.get(key);
    if (!previous || entry.lastUsedAt > previous.lastUsedAt) {
      merged.set(key, entry);
    }
  }
  const output = Array.from(merged.values());
  output.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  return output.slice(0, HISTORY_LIMIT);
}

function encodeWorkspaceHistoryForUrlHash(
  entries: WorkspaceHistoryEntry[],
): string | null {
  try {
    const json = JSON.stringify(entries.slice(0, HISTORY_LIMIT));
    const encoder = new TextEncoder();
    return encodeBase64Url(encoder.encode(json));
  } catch (error) {
    console.warn("Failed to encode workspace history for URL hash", error);
    return null;
  }
}

export function consumeWorkspaceHistoryHandoff(): void {
  const storage = safeLocalStorage();
  if (!storage) {
    return;
  }

  let encoded: string | null = null;
  try {
    encoded = storage.getItem(HISTORY_HANDOFF_KEY);
  } catch {
    return;
  }

  if (!encoded) {
    return;
  }

  try {
    storage.removeItem(HISTORY_HANDOFF_KEY);
  } catch {
    // Ignore storage failures.
  }

  let incoming: WorkspaceHistoryEntry[] = [];
  try {
    const bytes = decodeBase64Url(encoded);
    const decoded = new TextDecoder().decode(bytes);
    incoming = parseValidEntries(JSON.parse(decoded));
  } catch (error) {
    console.warn("Failed to decode workspace history handoff payload", error);
    return;
  }

  if (incoming.length === 0) {
    return;
  }

  const merged = mergeWorkspaceHistoryEntries(incoming, loadWorkspaceHistory());
  saveWorkspaceHistory(merged);
}

export function appendWorkspaceHistoryToBootstrapUrlFragment(
  bootstrapUrlFragment: string,
  entries: WorkspaceHistoryEntry[],
): string {
  if (typeof window === "undefined") {
    return bootstrapUrlFragment;
  }
  const encoded = encodeWorkspaceHistoryForUrlHash(entries);
  if (!encoded) {
    return bootstrapUrlFragment;
  }
  let url: URL;
  try {
    url = new URL(bootstrapUrlFragment, window.location.href);
  } catch (error) {
    console.warn("Failed to parse bootstrap URL fragment", error);
    return bootstrapUrlFragment;
  }
  const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
  const params = new URLSearchParams(hash);
  params.set("wh", encoded);
  url.hash = params.toString();
  return url.toString();
}
