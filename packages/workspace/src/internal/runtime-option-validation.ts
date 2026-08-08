type UnknownRecord = Record<string, unknown>;

export function isDenseArray(value: unknown): value is readonly unknown[] {
  if (!Array.isArray(value)) {
    return false;
  }
  const entries = Object.entries(value);
  return (
    entries.length === value.length &&
    entries.every(([key], index) => key === String(index)) &&
    Reflect.ownKeys(value).length === entries.length + 1
  );
}

export function denseArrayAt(value: unknown, label: string): readonly unknown[] {
  if (!isDenseArray(value)) {
    throw new TypeError(`${label} must be a dense array without extra fields.`);
  }
  return value;
}

export function optionOverridesAt(
  value: unknown,
  supportedKeys: readonly string[],
  optionsLabel: string,
  optionLabel: string,
): UnknownRecord {
  if (value === undefined) {
    return {};
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${optionsLabel} must be an object.`);
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${optionsLabel} must be a plain object.`);
  }
  const overrides = value as UnknownRecord;
  const supported = new Set(supportedKeys);
  const invalidKey = Reflect.ownKeys(overrides).find(
    (key) =>
      typeof key !== "string" ||
      !Object.prototype.propertyIsEnumerable.call(overrides, key) ||
      !supported.has(key),
  );
  if (invalidKey !== undefined) {
    throw new TypeError(`Unknown ${optionLabel} ${String(invalidKey)}.`);
  }
  return overrides;
}
