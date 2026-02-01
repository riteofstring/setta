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

function resolveBindingRecord(
  dataBindings: AppDataBindings | null | undefined,
  dataPath: string | null,
): AppBindingRecord | null {
  if (!dataBindings || !dataPath) {
    return null;
  }
  const raw = dataBindings[dataPath];
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

export function resolveParamBinding(
  props: BindingProps,
  dataBindings: AppDataBindings | null | undefined,
) {
  const dataPath = typeof props.dataPath === "string" ? props.dataPath : null;
  const binding = resolveBindingRecord(dataBindings, dataPath);
  const configId =
    (typeof props.configId === "string" ? props.configId : null) ??
    resolveBindingString(binding, "configId");
  const sectionId =
    (typeof props.sectionId === "string" ? props.sectionId : null) ??
    resolveBindingString(binding, "sectionId");
  const paramId =
    (typeof props.paramId === "string" ? props.paramId : null) ??
    resolveBindingString(binding, "paramId");
  const label =
    (typeof props.label === "string" ? props.label : null) ??
    resolveBindingString(binding, "label");
  const description =
    (typeof props.description === "string" ? props.description : null) ??
    resolveBindingString(binding, "description");
  return { configId, sectionId, paramId, label, description };
}

export function resolveTextOutputBinding(
  props: BindingProps,
  dataBindings: AppDataBindings | null | undefined,
) {
  const dataPath = typeof props.dataPath === "string" ? props.dataPath : null;
  const binding = resolveBindingRecord(dataBindings, dataPath);
  const configId =
    (typeof props.configId === "string" ? props.configId : null) ??
    resolveBindingString(binding, "configId");
  const sectionId =
    (typeof props.sectionId === "string" ? props.sectionId : null) ??
    resolveBindingString(binding, "sectionId");
  const label =
    (typeof props.label === "string" ? props.label : null) ??
    resolveBindingString(binding, "label");
  return { configId, sectionId, label };
}

export function resolveImageOutputBinding(
  props: BindingProps,
  dataBindings: AppDataBindings | null | undefined,
) {
  const dataPath = typeof props.dataPath === "string" ? props.dataPath : null;
  const binding = resolveBindingRecord(dataBindings, dataPath);
  const configId =
    (typeof props.configId === "string" ? props.configId : null) ??
    resolveBindingString(binding, "configId");
  const artifactId =
    (typeof props.artifactId === "string" ? props.artifactId : null) ??
    resolveBindingString(binding, "artifactId");
  const alt =
    (typeof props.alt === "string" ? props.alt : null) ??
    resolveBindingString(binding, "alt");
  return { configId, artifactId, alt };
}

export function resolveActionBinding(
  props: BindingProps,
  dataBindings: AppDataBindings | null | undefined,
) {
  const dataPath = typeof props.dataPath === "string" ? props.dataPath : null;
  const binding = resolveBindingRecord(dataBindings, dataPath);
  const configId =
    (typeof props.configId === "string" ? props.configId : null) ??
    resolveBindingString(binding, "configId");
  const action =
    (typeof props.action === "string" ? props.action : null) ??
    resolveBindingString(binding, "action");
  const sectionId =
    (typeof props.sectionId === "string" ? props.sectionId : null) ??
    resolveBindingString(binding, "sectionId");
  const label =
    (typeof props.label === "string" ? props.label : null) ??
    resolveBindingString(binding, "label");
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
