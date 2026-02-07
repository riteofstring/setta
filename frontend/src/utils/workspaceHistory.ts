export type WorkspaceHistoryEntry = {
  workspaceRoot: string;
  sshTarget: string | null;
  localPort: number | null;
  filesRoot: string | null;
  filesRootBase: string | null;
  lastUsedAt: number;
};

const HISTORY_KEY = "setta.workspaceHistory";
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
  while (output.length > 1 && output.endsWith("/")) {
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
  localPort: number | null;
  filesRoot: string | null;
  filesRootBase: string | null;
}) {
  const normalized = {
    workspaceRoot: normalizePathLike(entry.workspaceRoot),
    sshTarget: normalizeNullableString(entry.sshTarget),
    localPort: entry.localPort ?? null,
    filesRoot: normalizeNullablePathLike(entry.filesRoot),
    filesRootBase: normalizeNullablePathLike(entry.filesRootBase),
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
      filesRoot?: unknown;
      filesRootBase?: unknown;
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
      filesRoot: normalizeNullablePathLike(record.filesRoot),
      filesRootBase: normalizeNullablePathLike(record.filesRootBase),
      lastUsedAt: record.lastUsedAt,
    });
  }
  return output;
}

export function loadWorkspaceHistory(): WorkspaceHistoryEntry[] {
  if (typeof localStorage === "undefined") {
    return [];
  }
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
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
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
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

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.slice(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function encodeWorkspaceHistoryForUrlHash(
  entries: WorkspaceHistoryEntry[],
): string | null {
  try {
    const json = JSON.stringify(entries.slice(0, HISTORY_LIMIT));
    const encoder = new TextEncoder();
    return toBase64Url(encoder.encode(json));
  } catch (error) {
    console.warn("Failed to encode workspace history for URL hash", error);
    return null;
  }
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
