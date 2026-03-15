export type PluginConfigFieldDefinition = {
  key: string;
  required: boolean;
  schema: Record<string, unknown>;
};

export function resolveSchemaType(
  schema: Record<string, unknown>,
): string | null {
  const rawType = schema.type;
  if (typeof rawType === "string") {
    return rawType;
  }
  if (!Array.isArray(rawType)) {
    return null;
  }
  for (const value of rawType) {
    if (typeof value === "string" && value !== "null") {
      return value;
    }
  }
  return null;
}

export function getSchemaEnumValues(
  schema: Record<string, unknown>,
): Array<string | number | boolean> | null {
  const rawEnum = schema.enum;
  if (!Array.isArray(rawEnum) || rawEnum.length === 0) {
    return null;
  }
  const values: Array<string | number | boolean> = [];
  for (const enumValue of rawEnum) {
    if (
      typeof enumValue === "string" ||
      typeof enumValue === "number" ||
      typeof enumValue === "boolean"
    ) {
      values.push(enumValue);
    }
  }
  if (values.length === 0) {
    return null;
  }
  return values;
}

export function getSchemaUiHint(
  schema: Record<string, unknown>,
): string | null {
  const rawUiHint = schema["x-setta-ui"];
  if (typeof rawUiHint !== "string") {
    return null;
  }
  const trimmed = rawUiHint.trim();
  if (trimmed === "") {
    return null;
  }
  return trimmed;
}

export function isSupportedTopLevelPluginConfigField(
  schema: Record<string, unknown>,
): boolean {
  if (getSchemaEnumValues(schema)) {
    return true;
  }
  const schemaType = resolveSchemaType(schema);
  return (
    schemaType === "string" ||
    schemaType === "number" ||
    schemaType === "integer" ||
    schemaType === "boolean"
  );
}

export function getTopLevelPluginConfigFields(
  schemaJson: Record<string, unknown> | null,
): PluginConfigFieldDefinition[] {
  if (!isPlainObject(schemaJson)) {
    return [];
  }
  const properties = schemaJson.properties;
  if (!isPlainObject(properties)) {
    return [];
  }
  const requiredRaw = schemaJson.required;
  const requiredFields = new Set<string>();
  if (Array.isArray(requiredRaw)) {
    for (const value of requiredRaw) {
      if (typeof value === "string") {
        requiredFields.add(value);
      }
    }
  }

  const fields: PluginConfigFieldDefinition[] = [];
  for (const [key, value] of Object.entries(properties)) {
    if (!isPlainObject(value)) {
      continue;
    }
    fields.push({
      key,
      required: requiredFields.has(key),
      schema: value,
    });
  }
  fields.sort((a, b) => a.key.localeCompare(b.key));
  return fields;
}

export function setTopLevelPluginConfigValue(
  config: Record<string, unknown>,
  fieldKey: string,
  nextValue: unknown,
): Record<string, unknown> {
  const nextConfig = { ...config };
  if (nextValue === undefined) {
    delete nextConfig[fieldKey];
  } else {
    nextConfig[fieldKey] = nextValue;
  }
  return nextConfig;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  if (Array.isArray(value)) {
    return false;
  }
  return true;
}
