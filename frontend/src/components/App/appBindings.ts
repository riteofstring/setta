export type AppDataBindings = Record<string, unknown>;

type AppBindingRecord = Record<string, unknown>;

type AppActionDefinition = {
  type?: string;
  configId?: string;
  sectionId?: string;
  url?: string;
  artifactId?: string;
  contentId?: string;
  filename?: string;
  label?: string;
  action?: string;
  paramOverrides?: Record<string, string>;
  sectionVariantOverrides?: Record<string, string>;
};

export type AppActionDefinitions = Record<string, AppActionDefinition>;

type BindingProps = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function decodePointerSegment(segment: string): string {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

function resolvePointer(value: unknown, pointer: string): unknown {
  if (pointer === "") {
    return value;
  }
  if (!pointer.startsWith("/")) {
    return undefined;
  }
  let current: unknown = value;
  const segments = pointer
    .split("/")
    .slice(1)
    .map((segment) => decodePointerSegment(segment));
  for (const segment of segments) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || String(index) !== segment) {
        return undefined;
      }
      current = current[index];
      continue;
    }
    if (!isRecord(current)) {
      return undefined;
    }
    if (!(segment in current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

function resolveBindingRecord(
  dataBindings: AppDataBindings | null | undefined,
  dataPath: string | null,
): AppBindingRecord | null {
  if (!dataBindings || !dataPath) {
    return null;
  }
  const raw =
    dataPath.startsWith("/") || dataPath === ""
      ? resolvePointer(dataBindings, dataPath)
      : dataBindings[dataPath];
  if (!isRecord(raw)) {
    return null;
  }
  return raw;
}

function resolveBindingString(
  binding: AppBindingRecord | null,
  key: string,
): string | null {
  if (!binding) {
    return null;
  }
  const value = binding[key];
  return typeof value === "string" ? value : null;
}

function resolvePropString(props: BindingProps, key: string): string | null {
  const value = props[key];
  return typeof value === "string" ? value : null;
}

function resolveDataBinding(
  props: BindingProps,
  dataBindings: AppDataBindings | null | undefined,
): AppBindingRecord | null {
  return resolveBindingRecord(
    dataBindings,
    resolvePropString(props, "dataPath"),
  );
}

function resolveBoundString(
  props: BindingProps,
  binding: AppBindingRecord | null,
  key: string,
): string | null {
  return resolvePropString(props, key) ?? resolveBindingString(binding, key);
}

export function resolveParamBinding(
  props: BindingProps,
  dataBindings: AppDataBindings | null | undefined,
) {
  const binding = resolveDataBinding(props, dataBindings);
  const configId = resolveBoundString(props, binding, "configId");
  const sectionId = resolveBoundString(props, binding, "sectionId");
  const paramId = resolveBoundString(props, binding, "paramId");
  const label = resolveBoundString(props, binding, "label");
  const description = resolveBoundString(props, binding, "description");
  return { configId, sectionId, paramId, label, description };
}

export function resolveTextOutputBinding(
  props: BindingProps,
  dataBindings: AppDataBindings | null | undefined,
) {
  const binding = resolveDataBinding(props, dataBindings);
  const configId = resolveBoundString(props, binding, "configId");
  const sectionId = resolveBoundString(props, binding, "sectionId");
  const label = resolveBoundString(props, binding, "label");
  return { configId, sectionId, label };
}

export function resolveImageOutputBinding(
  props: BindingProps,
  dataBindings: AppDataBindings | null | undefined,
) {
  const binding = resolveDataBinding(props, dataBindings);
  const configId = resolveBoundString(props, binding, "configId");
  const artifactId = resolveBoundString(props, binding, "artifactId");
  const alt = resolveBoundString(props, binding, "alt");
  return { configId, artifactId, alt };
}

export function resolveActionBinding(
  props: BindingProps,
  dataBindings: AppDataBindings | null | undefined,
) {
  const binding = resolveDataBinding(props, dataBindings);
  const configId = resolveBoundString(props, binding, "configId");
  const action = resolveBoundString(props, binding, "action");
  const sectionId = resolveBoundString(props, binding, "sectionId");
  const label = resolveBoundString(props, binding, "label");
  return { configId, action, sectionId, label };
}

export function normalizeActionDefinitions(
  actions: Record<string, unknown> | null | undefined,
): AppActionDefinitions {
  if (!actions || !isRecord(actions)) {
    return {};
  }
  const output: AppActionDefinitions = {};
  for (const [name, value] of Object.entries(actions)) {
    if (!isRecord(value)) {
      continue;
    }
    output[name] = value as AppActionDefinition;
  }
  return output;
}

export function resolveActionType(
  actionName: string,
  definition: AppActionDefinition | null | undefined,
): string {
  if (definition && typeof definition.type === "string") {
    return definition.type;
  }
  return actionName;
}
