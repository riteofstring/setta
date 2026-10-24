export type UnknownRecord = Record<string, unknown>;

export function assertRecord(
  value: unknown,
  owner: string,
): asserts value is UnknownRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${owner} must be an object.`);
  }
}

export function assertKnownFields(
  record: UnknownRecord,
  owner: string,
  fields: ReadonlyArray<string>,
) {
  const knownFields = new Set(fields);
  for (const field of Object.keys(record)) {
    if (!knownFields.has(field)) {
      throw new Error(`${owner} contains the unknown field ${field}.`);
    }
  }
}

export function assertString(
  value: unknown,
  owner: string,
): asserts value is string {
  if (typeof value !== "string") {
    throw new Error(`${owner} must be a string.`);
  }
}

export function assertStringOptions(
  value: UnknownRecord,
  options: Readonly<Record<string, ReadonlyArray<string>>>,
  invalidMessage: (field: string, value: unknown) => string,
): void {
  for (const [field, allowed] of Object.entries(options)) {
    const option = value[field];
    if (typeof option !== "string" || !allowed.includes(option)) {
      throw new Error(invalidMessage(field, option));
    }
  }
}
