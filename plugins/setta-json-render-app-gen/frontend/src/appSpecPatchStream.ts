import type { Spec } from "@json-render/core";

import { AppSpecPatchPolicyConfig } from "./appSubsystemContracts";

type AppSpecPatchOp = {
  op: "set" | "add" | "replace" | "remove";
  path: string;
  value?: unknown;
};

type PointerResolution = {
  parent: unknown;
  key: string;
};

const ALLOWED_OPS = new Set<AppSpecPatchOp["op"]>(
  AppSpecPatchPolicyConfig.allowedOps as Array<AppSpecPatchOp["op"]>,
);

const VALUE_OPTIONAL_OPS = new Set<AppSpecPatchOp["op"]>(
  AppSpecPatchPolicyConfig.valueOptionalOps as Array<AppSpecPatchOp["op"]>,
);

const ELEMENTS_ROOT_TOKEN = "elements";

export function createEmptySpec(): Spec {
  return { root: "", elements: {} } as Spec;
}

export function parsePatchLine(line: string): AppSpecPatchOp | null {
  const trimmed = line.trim();
  if (shouldIgnorePatchLine(trimmed)) {
    return null;
  }
  const record = parsePatchObject(trimmed);
  if (!record) {
    return null;
  }
  const parsedShape = parsePatchShape(record);
  if (!parsedShape) {
    return null;
  }
  if (!hasRequiredPatchValue(record, parsedShape.op)) {
    return null;
  }
  return { ...record, ...parsedShape } as AppSpecPatchOp;
}

function shouldIgnorePatchLine(trimmed: string): boolean {
  return (
    trimmed.length === 0 ||
    trimmed.startsWith(AppSpecPatchPolicyConfig.commentPrefix)
  );
}

export function applyPatchOp(spec: Spec, patch: AppSpecPatchOp): void {
  // The browser applies patch previews locally so the app preview can update on
  // each streamed delta without waiting for a backend round trip. Go still owns
  // the supported patch surface through the generated AppSpecPatchPolicyConfig.
  if (applyRootPatch(spec, patch)) {
    return;
  }
  const elements = getElementsRecord(spec);
  if (!elements) {
    return;
  }
  const tokens = decodePointerTokens(patch.path);
  if (!isElementPatchTokens(tokens)) {
    return;
  }
  if (tokens.length === 2) {
    applyTopLevelElementPatch(elements, tokens[1] ?? "", patch);
    return;
  }
  applyNestedElementPatch(elements, tokens, patch);
}

function parsePatchObject(trimmed: string): Record<string, unknown> | null {
  let payload: unknown;
  try {
    payload = JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  return payload as Record<string, unknown>;
}

function parsePatchOp(
  record: Record<string, unknown>,
): AppSpecPatchOp["op"] | null {
  const op = record.op;
  if (typeof op !== "string" || !ALLOWED_OPS.has(op as AppSpecPatchOp["op"])) {
    return null;
  }
  return op as AppSpecPatchOp["op"];
}

function parsePatchPath(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  if (
    value !== AppSpecPatchPolicyConfig.rootPath &&
    !value.startsWith(AppSpecPatchPolicyConfig.elementsPathPrefix)
  ) {
    return null;
  }
  return value;
}

function parsePatchShape(
  record: Record<string, unknown>,
): Pick<AppSpecPatchOp, "op" | "path"> | null {
  const op = parsePatchOp(record);
  const path = parsePatchPath(record.path);
  if (!op || !path) {
    return null;
  }
  return { op, path };
}

function hasRequiredPatchValue(
  record: Record<string, unknown>,
  op: AppSpecPatchOp["op"],
): boolean {
  return (
    VALUE_OPTIONAL_OPS.has(op) ||
    Object.prototype.hasOwnProperty.call(record, "value")
  );
}

function applyRootPatch(spec: Spec, patch: AppSpecPatchOp): boolean {
  if (patch.path !== AppSpecPatchPolicyConfig.rootPath) {
    return false;
  }
  if (patch.op === "remove") {
    (spec as unknown as Record<string, unknown>).root =
      AppSpecPatchPolicyConfig.rootResetValue;
    return true;
  }
  if (typeof patch.value !== "string") {
    return true;
  }
  (spec as unknown as Record<string, unknown>).root = patch.value as unknown;
  return true;
}

function getElementsRecord(spec: Spec): Record<string, unknown> | null {
  const elements = (spec as unknown as Record<string, unknown>).elements;
  if (!elements || typeof elements !== "object" || Array.isArray(elements)) {
    return null;
  }
  return elements as Record<string, unknown>;
}

function isElementPatchTokens(tokens: Array<string>): boolean {
  return tokens.length >= 2 && tokens[0] === ELEMENTS_ROOT_TOKEN;
}

function applyTopLevelElementPatch(
  elements: Record<string, unknown>,
  key: string,
  patch: AppSpecPatchOp,
): void {
  if (!key) {
    return;
  }
  applyResolvedPatch(elements, key, patch);
}

function applyNestedElementPatch(
  elements: Record<string, unknown>,
  tokens: Array<string>,
  patch: AppSpecPatchOp,
): void {
  const elementKey = tokens[1] ?? "";
  if (!elementKey) {
    return;
  }
  const element = elements[elementKey];
  if (!element || typeof element !== "object" || Array.isArray(element)) {
    return;
  }
  const resolved = resolvePointerParent(
    element,
    tokens.slice(2),
    patch.op !== "remove",
  );
  if (!resolved) {
    return;
  }
  applyResolvedPatch(resolved.parent, resolved.key, patch);
}

function applyResolvedPatch(
  parent: unknown,
  key: string,
  patch: AppSpecPatchOp,
): void {
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
): PointerResolution | null {
  if (tokens.length === 0) {
    return null;
  }
  let current: unknown = root;
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const token = tokens[i];
    if (!token) {
      return null;
    }
    current = resolvePointerSegment(
      current,
      token,
      tokens[i + 1] ?? "",
      create,
    );
    if (current == null) {
      return null;
    }
  }
  const key = tokens[tokens.length - 1];
  if (!key) {
    return null;
  }
  return { parent: current, key };
}

function resolvePointerSegment(
  current: unknown,
  token: string,
  nextToken: string,
  create: boolean,
): unknown | null {
  if (Array.isArray(current)) {
    return resolveArrayPointerSegment(current, token, nextToken, create);
  }
  if (current && typeof current === "object") {
    return resolveObjectPointerSegment(
      current as Record<string, unknown>,
      token,
      nextToken,
      create,
    );
  }
  return null;
}

function resolveArrayPointerSegment(
  items: Array<unknown>,
  token: string,
  nextToken: string,
  create: boolean,
): unknown | null {
  const index = token === "-" ? items.length : parseArrayIndex(token);
  if (index === null || index > items.length) {
    return null;
  }
  if (index === items.length) {
    if (!create) {
      return null;
    }
    items.push(inferContainer(nextToken));
  }
  return items[index];
}

function resolveObjectPointerSegment(
  record: Record<string, unknown>,
  token: string,
  nextToken: string,
  create: boolean,
): unknown | null {
  if (
    !Object.prototype.hasOwnProperty.call(record, token) ||
    record[token] == null
  ) {
    if (!create) {
      return null;
    }
    record[token] = inferContainer(nextToken);
  }
  return record[token];
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
): void {
  if (Array.isArray(parent)) {
    setArrayValue(parent, key, value, op);
    return;
  }
  if (parent && typeof parent === "object") {
    setRecordValue(parent as Record<string, unknown>, key, value, op);
  }
}

function setArrayValue(
  parent: Array<unknown>,
  key: string,
  value: unknown,
  op: AppSpecPatchOp["op"],
): void {
  if (key === "-") {
    parent.push(value);
    return;
  }
  const index = parseArrayIndex(key);
  if (index === null || index > parent.length) {
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
}

function setRecordValue(
  record: Record<string, unknown>,
  key: string,
  value: unknown,
  op: AppSpecPatchOp["op"],
): void {
  if (op === "replace" && !Object.prototype.hasOwnProperty.call(record, key)) {
    return;
  }
  record[key] = value;
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
