import type { LaunchRequest } from "utils/generatedTypes";

type SerializableValue =
  | null
  | boolean
  | number
  | string
  | SerializableValue[]
  | { [key: string]: SerializableValue };

function toSerializableValue(value: unknown): SerializableValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => toSerializableValue(entry));
  }

  if (typeof value !== "object") {
    return String(value);
  }

  const objectValue = value as Record<string, unknown>;
  const normalized: { [key: string]: SerializableValue } = {};
  for (const [key, entry] of Object.entries(objectValue)) {
    if (entry === undefined) {
      continue;
    }
    normalized[key] = toSerializableValue(entry);
  }
  return normalized;
}

function stableStringify(value: SerializableValue): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    const entries = value.map((entry) => stableStringify(entry)).join(",");
    return `[${entries}]`;
  }

  const entries = Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(",");
  return `{${entries}}`;
}

export function buildLaunchRequestDedupeKey(request: LaunchRequest): string {
  const canonicalRequest: Record<string, SerializableValue> = {};
  const requestEntries = Object.entries(request as Record<string, unknown>)
    .filter(([, value]) => value !== null && value !== undefined)
    .sort(([left], [right]) => {
      if (left < right) {
        return -1;
      }
      if (left > right) {
        return 1;
      }
      return 0;
    });
  for (const [key, value] of requestEntries) {
    canonicalRequest[key] = toSerializableValue(value);
  }
  return stableStringify(canonicalRequest);
}
