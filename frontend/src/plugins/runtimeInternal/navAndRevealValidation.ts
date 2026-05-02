import { SettaPluginCanvasControlPlacementEnum } from "@setta/app-subsystem-frontend-sdk";

import {
  isPluginCanvasControlPlacement,
  PluginFrontendErrorCodeEnum,
  type PluginCanvasControlDefinition,
  type PluginFrontendErrorCode,
  type RegisteredPluginCanvasControl,
} from "./runtimeShared";

import {
  PluginFrontendError,
  PluginSettingRevealHandler,
  PluginTopNavBarItemDefinition,
  RegisteredPluginTopNavBarItem,
  settingRevealHandlersByPluginId,
  styleElementByPluginId,
  styleHrefByPluginId,
} from "./runtimeNormalization";

import { validatePluginRenderer } from "./backendRoutesAndCommands";

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

export function validateCanvasControlDefinition(
  pluginId: string,
  definition: PluginCanvasControlDefinition,
): RegisteredPluginCanvasControl {
  const id = requireNonEmptyString(
    definition.id,
    `Plugin ${pluginId} canvas control definition missing id.`,
  );
  const label = requireNonEmptyString(
    definition.label,
    `Plugin ${pluginId} canvas control ${id} missing label.`,
  );
  let placement = SettaPluginCanvasControlPlacementEnum.Project;
  if (definition.placement !== undefined) {
    const placementValue = requireNonEmptyString(
      definition.placement,
      `Plugin ${pluginId} canvas control ${id} placement must be supported.`,
    );
    if (!isPluginCanvasControlPlacement(placementValue)) {
      const supportedPlacements = Object.values(
        SettaPluginCanvasControlPlacementEnum,
      ).join(", ");
      throw new PluginRuntimeError(
        PluginFrontendErrorCodeEnum.RegistrationInvalid,
        `Plugin ${pluginId} canvas control ${id} placement ${placementValue} is invalid. ` +
          `Supported placements: ${supportedPlacements}.`,
      );
    }
    placement = placementValue;
  }
  if (
    definition.order !== undefined &&
    (!Number.isFinite(definition.order) || Number.isNaN(definition.order))
  ) {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} canvas control ${id} order must be a finite number.`,
    );
  }
  const renderer = validatePluginRenderer(
    pluginId,
    `canvas control ${id}`,
    definition.renderer,
  );
  const canvasControl: RegisteredPluginCanvasControl = {
    pluginId,
    id,
    label,
    placement,
    renderer,
  };
  if (definition.description !== undefined) {
    canvasControl.description = definition.description;
  }
  if (definition.order !== undefined) {
    canvasControl.order = definition.order;
  }
  return canvasControl;
}

export function requireNonEmptyString(
  value: unknown,
  errorMessage: string,
): string {
  if (typeof value !== "string") {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      errorMessage,
    );
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      errorMessage,
    );
  }
  return trimmed;
}

export function isPlainRecord(
  value: unknown,
): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  return Object.getPrototypeOf(value) === Object.prototype;
}

export function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  if (!value || typeof value !== "object") {
    return false;
  }
  return typeof (value as PromiseLike<unknown>).then === "function";
}

export class PluginRuntimeError extends Error {
  code: PluginFrontendErrorCode;

  constructor(code: PluginFrontendErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export function toPluginFrontendLoadError(
  pluginId: string,
  error: unknown,
): PluginFrontendError {
  if (error instanceof PluginRuntimeError) {
    return {
      code: error.code,
      message: error.message,
    };
  }
  const message =
    error instanceof Error
      ? error.message
      : `Unknown plugin frontend load error for ${pluginId}`;
  return {
    code: PluginFrontendErrorCodeEnum.FrontendLoadFailed,
    message,
  };
}

export function ensurePluginStyleLoaded(
  pluginId: string,
  styleUrl: string | null,
): void {
  if (!styleUrl) {
    const existingStyle = styleElementByPluginId.get(pluginId);
    if (existingStyle) {
      existingStyle.remove();
      styleElementByPluginId.delete(pluginId);
      styleHrefByPluginId.delete(pluginId);
    }
    return;
  }

  const previousHref = styleHrefByPluginId.get(pluginId);
  if (previousHref === styleUrl && styleElementByPluginId.has(pluginId)) {
    return;
  }

  const existingStyle = styleElementByPluginId.get(pluginId);
  if (existingStyle) {
    existingStyle.remove();
    styleElementByPluginId.delete(pluginId);
  }

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = styleUrl;
  link.dataset.settaPluginId = pluginId;
  link.dataset.settaPluginStyle = "true";
  document.head.append(link);

  styleElementByPluginId.set(pluginId, link);
  styleHrefByPluginId.set(pluginId, styleUrl);
}

export function removeInactivePluginStyles(activePluginIds: Set<string>): void {
  for (const [pluginId, styleElement] of styleElementByPluginId.entries()) {
    if (activePluginIds.has(pluginId)) {
      continue;
    }
    styleElement.remove();
    styleElementByPluginId.delete(pluginId);
    styleHrefByPluginId.delete(pluginId);
  }
}

export function getPluginSettingRevealHandler(
  pluginId: string,
  revealKey: string,
): PluginSettingRevealHandler | null {
  const handlersByKey = settingRevealHandlersByPluginId.get(pluginId);
  if (!handlersByKey) {
    return null;
  }
  return handlersByKey.get(revealKey) ?? null;
}

export function buildPluginSettingRevealFailure(
  pluginId: string,
  revealKey: string,
  reason:
    | "missing"
    | "aborted"
    | "timeout"
    | "unhandled"
    | "non_boolean"
    | "missing_plugin_handlers"
    | "failed",
  errorMessage?: string,
): { ok: false; message: string } {
  switch (reason) {
    case "missing_plugin_handlers":
      return {
        ok: false,
        message: `Plugin ${pluginId} has no setting reveal handlers.`,
      };
    case "missing":
      return {
        ok: false,
        message: `Plugin ${pluginId} has no setting reveal handler for ${revealKey}.`,
      };
    case "aborted":
      return {
        ok: false,
        message: `Plugin ${pluginId} reveal handler ${revealKey} was aborted before invocation.`,
      };
    case "timeout":
      return {
        ok: false,
        message: `Plugin ${pluginId} reveal handler ${revealKey} timed out.`,
      };
    case "unhandled":
      return {
        ok: false,
        message: `Plugin ${pluginId} did not handle setting reveal ${revealKey}.`,
      };
    case "non_boolean":
      return {
        ok: false,
        message: `Plugin ${pluginId} reveal handler ${revealKey} returned a non-boolean value.`,
      };
  }
  return {
    ok: false,
    message: `Plugin ${pluginId} reveal handler ${revealKey} failed: ${errorMessage ?? "unknown error"}`,
  };
}

export function resolvePluginSettingRevealFailureMessage(
  error: unknown,
): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return String(error);
}

export async function invokePluginSettingRevealHandler({
  pluginId,
  revealKey,
  settingId,
  paneId,
  durationMs,
  abortSignal,
}: {
  pluginId: string;
  revealKey: string;
  settingId: string;
  paneId: string | null;
  durationMs: number;
  abortSignal: AbortSignal;
}): Promise<{ ok: boolean; message: string | null }> {
  const handlersByKey = settingRevealHandlersByPluginId.get(pluginId);
  if (!handlersByKey) {
    return buildPluginSettingRevealFailure(
      pluginId,
      revealKey,
      "missing_plugin_handlers",
    );
  }
  const handler = getPluginSettingRevealHandler(pluginId, revealKey);
  if (!handler) {
    return buildPluginSettingRevealFailure(pluginId, revealKey, "missing");
  }
  if (abortSignal.aborted) {
    return buildPluginSettingRevealFailure(pluginId, revealKey, "aborted");
  }
  try {
    const handled = await handler({
      settingId,
      paneId,
      durationMs,
      abortSignal,
    });
    if (abortSignal.aborted) {
      return buildPluginSettingRevealFailure(pluginId, revealKey, "timeout");
    }
    if (handled === true) {
      return { ok: true, message: null };
    }
    if (handled === false) {
      return buildPluginSettingRevealFailure(pluginId, revealKey, "unhandled");
    }
    return buildPluginSettingRevealFailure(pluginId, revealKey, "non_boolean");
  } catch (error) {
    if (abortSignal.aborted) {
      return buildPluginSettingRevealFailure(pluginId, revealKey, "timeout");
    }
    return buildPluginSettingRevealFailure(
      pluginId,
      revealKey,
      "failed",
      resolvePluginSettingRevealFailureMessage(error),
    );
  }
}
