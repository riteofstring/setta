import type { JsonValue } from "./types.js";

const MAXIMUM_JSON_DEPTH = 100;

function assertFiniteJsonNumber(value: number): void {
  if (!Number.isFinite(value)) {
    throw new Error("Clipboard JSON numbers must be finite.");
  }
}

function assertPlainJsonObject(value: object): void {
  const prototype = Object.getPrototypeOf(value) as object | null;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error("Clipboard JSON objects must be plain objects.");
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new Error("Clipboard JSON objects cannot contain symbol keys.");
  }
  for (const propertyName of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, propertyName);
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      throw new Error(
        "Clipboard JSON objects must contain enumerable data properties.",
      );
    }
  }
}

function isCanonicalArrayIndex(propertyName: string): boolean {
  const index = Number(propertyName);
  return (
    Number.isInteger(index) && index >= 0 && String(index) === propertyName
  );
}

function assertEnumerableDataArrayProperty(
  value: Array<unknown>,
  propertyName: string,
): void {
  const descriptor = Object.getOwnPropertyDescriptor(value, propertyName);
  if (!descriptor?.enumerable || !("value" in descriptor)) {
    throw new Error(
      "Clipboard JSON arrays must contain enumerable data properties.",
    );
  }
}

function assertJsonArrayProperty(
  value: Array<unknown>,
  propertyName: string,
): void {
  if (propertyName === "length") {
    return;
  }
  if (!isCanonicalArrayIndex(propertyName)) {
    throw new Error("Clipboard JSON arrays cannot contain named properties.");
  }
  assertEnumerableDataArrayProperty(value, propertyName);
}

function assertJsonArrayProperties(value: Array<unknown>): void {
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new Error("Clipboard JSON arrays cannot contain symbol keys.");
  }
  for (const propertyName of Object.getOwnPropertyNames(value)) {
    assertJsonArrayProperty(value, propertyName);
  }
}

function assertJsonArrayEntries(
  value: Array<unknown>,
  ancestors: Set<object>,
  depth: number,
): void {
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      throw new Error("Clipboard JSON arrays cannot contain holes.");
    }
    assertWorkspaceClipboardJsonValueAtDepth(
      value[index],
      ancestors,
      depth + 1,
    );
  }
}

function assertJsonArray(
  value: Array<unknown>,
  ancestors: Set<object>,
  depth: number,
): void {
  assertJsonArrayProperties(value);
  assertJsonArrayEntries(value, ancestors, depth);
}

function assertJsonObject(
  value: object,
  ancestors: Set<object>,
  depth: number,
): void {
  assertPlainJsonObject(value);
  for (const entry of Object.values(value as Record<string, unknown>)) {
    assertWorkspaceClipboardJsonValueAtDepth(entry, ancestors, depth + 1);
  }
}

function assertWorkspaceClipboardJsonValueAtDepth(
  value: unknown,
  ancestors: Set<object>,
  depth: number,
): asserts value is JsonValue {
  if (depth > MAXIMUM_JSON_DEPTH) {
    throw new Error("Clipboard JSON exceeds the maximum nesting depth.");
  }
  if (value === null) {
    return;
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return;
  }
  if (typeof value === "number") {
    assertFiniteJsonNumber(value);
    return;
  }
  if (typeof value !== "object") {
    throw new Error("Clipboard values must be JSON-compatible.");
  }
  if (ancestors.has(value)) {
    throw new Error("Clipboard JSON cannot contain cycles.");
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      assertJsonArray(value, ancestors, depth);
    } else {
      assertJsonObject(value, ancestors, depth);
    }
  } finally {
    ancestors.delete(value);
  }
}

export function assertWorkspaceClipboardJsonValue(
  value: unknown,
): asserts value is JsonValue {
  assertWorkspaceClipboardJsonValueAtDepth(value, new Set<object>(), 0);
}

function freezeWorkspaceClipboardJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    for (const entry of value) {
      freezeWorkspaceClipboardJsonValue(entry);
    }
    return Object.freeze(value) as unknown as JsonValue;
  }
  if (value !== null && typeof value === "object") {
    for (const entry of Object.values(value)) {
      freezeWorkspaceClipboardJsonValue(entry);
    }
    return Object.freeze(value) as unknown as JsonValue;
  }
  return value;
}

export function cloneWorkspaceClipboardJsonValue<T extends JsonValue>(
  value: T,
): T {
  assertWorkspaceClipboardJsonValue(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

export function cloneFrozenWorkspaceClipboardJsonValue<T extends JsonValue>(
  value: T,
): T {
  return freezeWorkspaceClipboardJsonValue(
    cloneWorkspaceClipboardJsonValue(value),
  ) as T;
}

export function getWorkspaceClipboardUtf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
