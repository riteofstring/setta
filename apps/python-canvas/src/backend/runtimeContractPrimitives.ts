export class ProjectSnapshotValidationError extends Error {
  public constructor(
    public readonly field: string,
    problem: string,
  ) {
    super(`Invalid ProjectSnapshotV2 ${field}: ${problem}.`);
    this.name = "ProjectSnapshotValidationError";
  }
}

export function readText(
  value: unknown,
  field: string,
  allowEmpty: boolean,
): string {
  const text = readString(value, field);
  if ((!allowEmpty && text === "") || text.includes("\0")) {
    fail(field, "is invalid");
  }
  return text;
}

export function readTextOrNull(value: unknown, field: string): string | null {
  return value === null ? null : readText(value, field, true);
}

export function readNonBlankString(value: unknown, field: string): string {
  const text = readText(value, field, false);
  if (text.trim() === "") {
    fail(field, "must not be empty");
  }
  return text;
}

export function readString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    fail(field, "must be a string");
  }
  return value;
}

export function readBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    fail(field, "must be a boolean");
  }
  return value;
}

export function readPositiveInteger(value: unknown, field: string): number {
  const result = readNonNegativeInteger(value, field);
  if (result < 1) {
    fail(field, "must be positive");
  }
  return result;
}

export function readPositiveIntegerOrNull(
  value: unknown,
  field: string,
): number | null {
  return value === null ? null : readPositiveInteger(value, field);
}

export function readFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(field, "must be a finite number");
  }
  return value;
}

export function readOption<const Values extends readonly string[]>(
  value: unknown,
  field: string,
  options: Values,
): Values[number] {
  const result = readString(value, field);
  if (!options.includes(result)) {
    fail(field, "is not supported");
  }
  return result as Values[number];
}

export function readNonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    fail(field, "must be a nonnegative safe integer");
  }
  return value;
}

export function readNonNegativeIntegerOrNull(
  value: unknown,
  field: string,
): number | null {
  return value === null ? null : readNonNegativeInteger(value, field);
}

export function readArray<T>(
  value: unknown,
  field: string,
  parseEntry: (entry: unknown, index: number) => T,
): T[] {
  if (!Array.isArray(value)) {
    fail(field, "must be an array");
  }
  return value.map(parseEntry);
}

export function readClosedRecord(
  value: unknown,
  field: string,
  keys: readonly string[],
): Record<string, unknown> {
  const record = readPlainRecord(value, field);
  requireExactEnumerableKeys(record, keys, field);
  return record;
}

export function readPlainRecord(
  value: unknown,
  field: string,
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) {
    fail(field, "must be an object");
  }
  return value as Record<string, unknown>;
}

export function requireExactEnumerableKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
  field: string,
): void {
  const names = Object.getOwnPropertyNames(record);
  if (
    Object.getOwnPropertySymbols(record).length !== 0 ||
    names.length !== keys.length ||
    keys.some(
      (key) =>
        !names.includes(key) ||
        !Object.prototype.propertyIsEnumerable.call(record, key),
    )
  ) {
    fail(field, "must contain exactly the V2 fields");
  }
}

export function fail(field: string, problem: string): never {
  throw new ProjectSnapshotValidationError(field, problem);
}
