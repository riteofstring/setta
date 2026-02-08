import type { Spec } from "@json-render/core";

type AppSpecPatchOp = {
  op: "set" | "add" | "replace" | "remove";
  path: string;
  value?: unknown;
};

const ALLOWED_OPS = new Set<AppSpecPatchOp["op"]>([
  "set",
  "add",
  "replace",
  "remove",
]);

export function createEmptySpec(): Spec {
  return { root: "", elements: {} } as Spec;
}

export function parsePatchLine(line: string): AppSpecPatchOp | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("//")) {
    return null;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const op = record.op;
  const path = record.path;
  if (typeof op !== "string" || !ALLOWED_OPS.has(op as AppSpecPatchOp["op"])) {
    return null;
  }
  if (typeof path !== "string") {
    return null;
  }
  if (path !== "/root" && !path.startsWith("/elements/")) {
    return null;
  }
  if (
    op !== "remove" &&
    !Object.prototype.hasOwnProperty.call(record, "value")
  ) {
    return null;
  }
  return record as AppSpecPatchOp;
}

export function applyPatchOp(spec: Spec, patch: AppSpecPatchOp): void {
  if (patch.path === "/root") {
    if (patch.op === "remove") {
      (spec as unknown as Record<string, unknown>).root = "";
      return;
    }
    (spec as unknown as Record<string, unknown>).root = patch.value as unknown;
    return;
  }

  const tokens = decodePointerTokens(patch.path);
  const resolved = resolvePointerParent(spec as unknown, tokens, true);
  if (!resolved) {
    return;
  }
  const { parent, key } = resolved;
  if (patch.op === "remove") {
    removeAt(parent, key);
    return;
  }
  setAt(parent, key, patch.value, patch.op);
}

function decodePointerTokens(path: string): Array<string> {
  if (!path.startsWith("/")) {
    return [];
  }
  return path
    .split("/")
    .slice(1)
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
}

function resolvePointerParent(
  root: unknown,
  tokens: Array<string>,
  create: boolean,
): { parent: unknown; key: string } | null {
  if (tokens.length === 0) {
    return null;
  }
  let current: unknown = root;
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const token = tokens[i];
    const nextToken = tokens[i + 1] ?? "";
    if (!token) {
      return null;
    }
    if (Array.isArray(current)) {
      const index = token === "-" ? current.length : parseArrayIndex(token);
      if (index === null) {
        return null;
      }
      if (index === current.length) {
        if (!create) {
          return null;
        }
        current.push(inferContainer(nextToken));
      } else if (index > current.length) {
        return null;
      }
      current = current[index];
      continue;
    }
    if (current && typeof current === "object") {
      const record = current as Record<string, unknown>;
      if (
        !Object.prototype.hasOwnProperty.call(record, token) ||
        record[token] == null
      ) {
        if (!create) {
          return null;
        }
        record[token] = inferContainer(nextToken);
      }
      current = record[token];
      continue;
    }
    return null;
  }
  const key = tokens[tokens.length - 1];
  if (!key) {
    return null;
  }
  return { parent: current, key };
}

function inferContainer(
  nextToken: string,
): Record<string, unknown> | Array<unknown> {
  if (nextToken === "-" || /^\d+$/.test(nextToken)) {
    return [];
  }
  return {};
}

function parseArrayIndex(token: string): number | null {
  if (!/^\d+$/.test(token)) {
    return null;
  }
  const value = Number(token);
  return Number.isSafeInteger(value) ? value : null;
}

function setAt(
  parent: unknown,
  key: string,
  value: unknown,
  op: AppSpecPatchOp["op"],
) {
  if (Array.isArray(parent)) {
    if (key === "-") {
      parent.push(value);
      return;
    }
    const index = parseArrayIndex(key);
    if (index === null) {
      return;
    }
    if (index > parent.length) {
      return;
    }
    if (op === "replace" && index >= parent.length) {
      return;
    }
    if (index === parent.length) {
      parent.push(value);
      return;
    }
    parent[index] = value;
    return;
  }
  if (parent && typeof parent === "object") {
    const record = parent as Record<string, unknown>;
    if (
      op === "replace" &&
      !Object.prototype.hasOwnProperty.call(record, key)
    ) {
      return;
    }
    record[key] = value;
  }
}

function removeAt(parent: unknown, key: string) {
  if (Array.isArray(parent)) {
    if (key === "-") {
      return;
    }
    const index = parseArrayIndex(key);
    if (index === null || index < 0 || index >= parent.length) {
      return;
    }
    parent.splice(index, 1);
    return;
  }
  if (parent && typeof parent === "object") {
    const record = parent as Record<string, unknown>;
    delete record[key];
  }
}
