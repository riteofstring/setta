import {
  isPluginPaneIconName,
  PluginPaneIconNameEnum,
  type PluginPaneIconName,
} from "./paneIcons";
import {
  type PluginCommandDefinition,
  type PluginPaneDefinition,
  type PluginSectionKindDefinition,
  type PluginTopNavBarItemDefinition,
  type RegisteredPluginCommand,
  type RegisteredPluginPane,
  type RegisteredPluginSectionKind,
  type RegisteredPluginTopNavBarItem,
} from "./runtimeHostTypes";
import {
  isPlainRecord,
  PluginFrontendErrorCodeEnum,
  PluginRuntimeError,
  requireNonEmptyString,
} from "./runtimeValidation";

export function toLiteralRealtimePayload(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (typeof serialized === "string") {
    return serialized;
  }
  return "null";
}

export function normalizePluginPath(path: string): string {
  const trimmed = path.trim();
  if (trimmed === "") {
    return "";
  }
  const normalizedInput = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const queryStart = normalizedInput.search(/[?#]/);
  const pathPart =
    queryStart >= 0 ? normalizedInput.slice(0, queryStart) : normalizedInput;
  const suffix = queryStart >= 0 ? normalizedInput.slice(queryStart) : "";
  const segments = pathPart.split("/").filter((segment) => segment.length > 0);
  let decodedPathPart = pathPart;
  try {
    decodedPathPart = decodeURIComponent(pathPart);
  } catch {
    decodedPathPart = pathPart;
  }
  const decodedSegments = decodedPathPart
    .split("/")
    .filter((segment) => segment.length > 0);
  if (decodedSegments.some((segment) => segment === "." || segment === "..")) {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `apiFetch path cannot include relative traversal segments: ${path}`,
    );
  }
  const hasTrailingSlash = pathPart.endsWith("/") && pathPart !== "/";
  let canonicalPath = "/";
  if (segments.length > 0) {
    canonicalPath = `/${segments.join("/")}`;
    if (hasTrailingSlash) {
      canonicalPath = `${canonicalPath}/`;
    }
  }
  return `${canonicalPath}${suffix}`;
}

export function ensureCapability(
  pluginId: string,
  effectiveCapabilitySet: Set<string>,
  requiredCapability: string,
  hostMethodName: string,
): void {
  if (effectiveCapabilitySet.has(requiredCapability)) {
    return;
  }
  throw new PluginRuntimeError(
    PluginFrontendErrorCodeEnum.CapabilityDenied,
    `Plugin ${pluginId} cannot call ${hostMethodName}; missing effective capability ${requiredCapability}.`,
  );
}

export function validateSectionKindDefinition(
  pluginId: string,
  definition: PluginSectionKindDefinition,
): RegisteredPluginSectionKind {
  const kind = requireNonEmptyString(
    definition.kind,
    `Plugin ${pluginId} section kind definition missing kind.`,
  );
  const title = requireNonEmptyString(
    definition.title,
    `Plugin ${pluginId} section kind ${kind} missing title.`,
  );
  if (!definition.renderer || typeof definition.renderer !== "object") {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} section kind ${kind} missing renderer object.`,
    );
  }
  if (typeof definition.renderer.mount !== "function") {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} section kind ${kind} renderer.mount must be a function.`,
    );
  }
  if (
    definition.renderer.update !== undefined &&
    typeof definition.renderer.update !== "function"
  ) {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} section kind ${kind} renderer.update must be a function when provided.`,
    );
  }
  if (
    definition.renderer.unmount !== undefined &&
    typeof definition.renderer.unmount !== "function"
  ) {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} section kind ${kind} renderer.unmount must be a function when provided.`,
    );
  }
  if (
    definition.initialData !== undefined &&
    !isPlainRecord(definition.initialData)
  ) {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} section kind ${kind} initialData must be a plain object when provided.`,
    );
  }

  const sectionKind: RegisteredPluginSectionKind = {
    pluginId,
    kind,
    title,
    renderer: definition.renderer,
  };
  if (definition.description !== undefined) {
    sectionKind.description = definition.description;
  }
  if (definition.initialData !== undefined) {
    sectionKind.initialData = definition.initialData;
  }
  return sectionKind;
}

export function validatePaneDefinition(
  pluginId: string,
  definition: PluginPaneDefinition,
): RegisteredPluginPane {
  const id = requireNonEmptyString(
    definition.id,
    `Plugin ${pluginId} pane definition missing id.`,
  );
  const title = requireNonEmptyString(
    definition.title,
    `Plugin ${pluginId} pane ${id} missing title.`,
  );
  if (!definition.renderer || typeof definition.renderer !== "object") {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} pane ${id} missing renderer object.`,
    );
  }
  if (typeof definition.renderer.mount !== "function") {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} pane ${id} renderer.mount must be a function.`,
    );
  }
  if (
    definition.renderer.update !== undefined &&
    typeof definition.renderer.update !== "function"
  ) {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} pane ${id} renderer.update must be a function when provided.`,
    );
  }
  if (
    definition.renderer.unmount !== undefined &&
    typeof definition.renderer.unmount !== "function"
  ) {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} pane ${id} renderer.unmount must be a function when provided.`,
    );
  }
  let icon: PluginPaneIconName | undefined;
  if (definition.icon !== undefined) {
    const iconValue = requireNonEmptyString(
      definition.icon,
      `Plugin ${pluginId} pane ${id} icon must be a supported icon name.`,
    );
    if (!isPluginPaneIconName(iconValue)) {
      const supportedIconNames = Object.values(PluginPaneIconNameEnum).join(
        ", ",
      );
      throw new PluginRuntimeError(
        PluginFrontendErrorCodeEnum.RegistrationInvalid,
        `Plugin ${pluginId} pane ${id} icon ${iconValue} is invalid. ` +
          `Supported icons: ${supportedIconNames}.`,
      );
    }
    icon = iconValue;
  }

  const paneDefinition: RegisteredPluginPane = {
    pluginId,
    id,
    title,
    renderer: definition.renderer,
  };
  if (definition.description !== undefined) {
    paneDefinition.description = definition.description;
  }
  if (icon !== undefined) {
    paneDefinition.icon = icon;
  }
  return paneDefinition;
}

export function validateCommandDefinition(
  pluginId: string,
  definition: PluginCommandDefinition,
): RegisteredPluginCommand {
  const id = requireNonEmptyString(
    definition.id,
    `Plugin ${pluginId} command definition missing id.`,
  );
  const title = requireNonEmptyString(
    definition.title,
    `Plugin ${pluginId} command ${id} missing title.`,
  );
  if (typeof definition.run !== "function") {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} command ${id} run must be a function.`,
    );
  }

  const commandDefinition: RegisteredPluginCommand = {
    pluginId,
    id,
    title,
    run: definition.run,
  };
  if (definition.description !== undefined) {
    commandDefinition.description = definition.description;
  }
  return commandDefinition;
}

export function validateTopNavBarItemDefinition(
  pluginId: string,
  definition: PluginTopNavBarItemDefinition,
): RegisteredPluginTopNavBarItem {
  const id = requireNonEmptyString(
    definition.id,
    `Plugin ${pluginId} top nav item definition missing id.`,
  );
  const label = requireNonEmptyString(
    definition.label,
    `Plugin ${pluginId} top nav item ${id} missing label.`,
  );
  if (typeof definition.onClick !== "function") {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} top nav item ${id} onClick must be a function.`,
    );
  }
  if (
    definition.order !== undefined &&
    (!Number.isFinite(definition.order) || Number.isNaN(definition.order))
  ) {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} top nav item ${id} order must be a finite number.`,
    );
  }
  const topNavBarItem: RegisteredPluginTopNavBarItem = {
    pluginId,
    id,
    label,
    onClick: definition.onClick,
  };
  if (definition.description !== undefined) {
    topNavBarItem.description = definition.description;
  }
  if (definition.order !== undefined) {
    topNavBarItem.order = definition.order;
  }
  return topNavBarItem;
}
