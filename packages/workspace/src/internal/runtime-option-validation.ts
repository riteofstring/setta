type UnknownRecord = Record<string, unknown>;

export function isEnumerableDataProperty(value: object, key: PropertyKey): boolean {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor?.enumerable === true && "value" in descriptor;
}

export function isDenseArray(value: unknown): value is readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    return false;
  }
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== value.length + 1) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!isEnumerableDataProperty(value, String(index))) {
      return false;
    }
  }
  return true;
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
      typeof key !== "string" || !isEnumerableDataProperty(overrides, key) || !supported.has(key),
  );
  if (invalidKey !== undefined) {
    throw new TypeError(`Unknown ${optionLabel} ${String(invalidKey)}.`);
  }
  return overrides;
}
