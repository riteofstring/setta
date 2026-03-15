import { useActiveSectionUI } from "state/activeSectionUI";
import { useProjectState } from "state/definitions";
import {
  PluginFrontendErrorCodeEnum,
  PluginRuntimeError,
  requireNonEmptyString,
} from "./runtimeValidation";

export type PluginProjectStateSelector =
  | { kind: "projectConfig" }
  | { kind: "activeSectionIds" }
  | { kind: "section"; sectionId: string }
  | { kind: "sections"; sectionIds: string[] }
  | { kind: "singletonSections" };

export type PluginProjectStateSubscriptionOptions = {
  fireImmediately?: boolean;
  throttleMs?: number;
};

export function normalizeProjectStateSelector(
  pluginId: string,
  selector: PluginProjectStateSelector,
): PluginProjectStateSelector {
  if (!selector || typeof selector !== "object" || Array.isArray(selector)) {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} provided an invalid project state selector.`,
    );
  }
  const rawKind = (selector as { kind?: unknown }).kind;
  if (typeof rawKind !== "string" || rawKind.trim() === "") {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} project state selector is missing kind.`,
    );
  }
  const kind = rawKind.trim();
  if (kind === "projectConfig" || kind === "activeSectionIds") {
    return { kind };
  }
  if (kind === "singletonSections") {
    return { kind };
  }
  if (kind === "section") {
    const sectionId = requireNonEmptyString(
      (selector as { sectionId?: unknown }).sectionId,
      `Plugin ${pluginId} section selector missing sectionId.`,
    );
    return {
      kind,
      sectionId,
    };
  }
  if (kind === "sections") {
    const sectionIdsRaw = (selector as { sectionIds?: unknown }).sectionIds;
    if (!Array.isArray(sectionIdsRaw)) {
      throw new PluginRuntimeError(
        PluginFrontendErrorCodeEnum.RegistrationInvalid,
        `Plugin ${pluginId} sections selector must provide sectionIds array.`,
      );
    }
    const sectionIds: string[] = [];
    for (const rawSectionId of sectionIdsRaw) {
      sectionIds.push(
        requireNonEmptyString(
          rawSectionId,
          `Plugin ${pluginId} sections selector contains invalid sectionId.`,
        ),
      );
    }
    return {
      kind,
      sectionIds,
    };
  }
  throw new PluginRuntimeError(
    PluginFrontendErrorCodeEnum.RegistrationInvalid,
    `Plugin ${pluginId} project state selector kind ${kind} is unsupported.`,
  );
}

export function getRawSelectedProjectState(
  state: ReturnType<typeof useProjectState.getState>,
  selector: PluginProjectStateSelector,
): unknown {
  if (selector.kind === "projectConfig") {
    return state.projectConfig;
  }
  if (selector.kind === "activeSectionIds") {
    return useActiveSectionUI.getState().activeIds;
  }
  if (selector.kind === "singletonSections") {
    return state.singletonSections;
  }
  if (selector.kind === "section") {
    const variantId = state.projectConfig.sectionVariantMap[selector.sectionId];
    if (!variantId) {
      return null;
    }
    const variant = state.sectionVariants[variantId];
    if (!variant) {
      return null;
    }
    const impl = state.sectionImpls[variant.impl];
    if (!impl) {
      return null;
    }
    return impl;
  }
  return selector.sectionIds.map((sectionId) => {
    const variantId = state.projectConfig.sectionVariantMap[sectionId];
    if (!variantId) {
      return null;
    }
    const variant = state.sectionVariants[variantId];
    if (!variant) {
      return null;
    }
    const impl = state.sectionImpls[variant.impl];
    if (!impl) {
      return null;
    }
    return impl;
  });
}

export function projectStateSubscriptionEquality(
  selector: PluginProjectStateSelector,
): ((left: unknown, right: unknown) => boolean) | undefined {
  if (selector.kind === "activeSectionIds") {
    return areOrderedArrayValuesEqual;
  }
  if (selector.kind !== "sections") {
    return undefined;
  }
  return areOrderedArrayValuesEqual;
}

export function toProjectStateReadValue(
  selector: PluginProjectStateSelector,
  rawValue: unknown,
): unknown {
  if (selector.kind !== "sections") {
    return cloneProjectStateSnapshot(rawValue);
  }
  return toProjectStateSectionSnapshot(selector.sectionIds, rawValue);
}

export function toProjectStateSubscriptionValue(
  selector: PluginProjectStateSelector,
  rawValue: unknown,
  previousRawValue?: unknown,
  previousSnapshot?: unknown,
): unknown {
  if (selector.kind !== "sections") {
    if (rawValue === undefined) {
      return null;
    }
    return cloneProjectStateSnapshot(rawValue);
  }
  return toProjectStateSectionSnapshot(
    selector.sectionIds,
    rawValue,
    previousRawValue,
    previousSnapshot,
  );
}

export function toProjectStateSectionSnapshot(
  sectionIds: string[],
  rawValue: unknown,
  previousRawValue?: unknown,
  previousSnapshot?: unknown,
): Record<string, unknown> {
  if (!Array.isArray(rawValue)) {
    return {};
  }
  const previousValues = Array.isArray(previousRawValue)
    ? previousRawValue
    : null;
  const previousBySection =
    isRecordProjectStateValue(previousSnapshot) &&
    !Array.isArray(previousSnapshot)
      ? previousSnapshot
      : null;
  const snapshot: Record<string, unknown> = {};
  for (let index = 0; index < sectionIds.length; index += 1) {
    const sectionId = sectionIds[index];
    const value = rawValue[index] ?? null;
    if (
      previousValues &&
      previousBySection &&
      previousValues[index] === value &&
      sectionId in previousBySection
    ) {
      snapshot[sectionId] = previousBySection[sectionId];
      continue;
    }
    snapshot[sectionId] = cloneProjectStateSnapshot(value);
  }
  return snapshot;
}

export function cloneProjectStateSnapshot(rawValue: unknown): unknown {
  if (rawValue === null || rawValue === undefined) {
    return rawValue;
  }
  if (Array.isArray(rawValue)) {
    let hasOnlyScalars = true;
    for (const item of rawValue) {
      if (!isScalarProjectStateValue(item)) {
        hasOnlyScalars = false;
        break;
      }
    }
    if (hasOnlyScalars) {
      return rawValue.slice();
    }
  }
  if (typeof rawValue !== "object") {
    return rawValue;
  }
  return structuredClone(rawValue);
}

function areOrderedArrayValuesEqual(left: unknown, right: unknown): boolean {
  if (!Array.isArray(left) || !Array.isArray(right)) {
    return false;
  }
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function isScalarProjectStateValue(value: unknown): boolean {
  if (value === null) {
    return true;
  }
  const valueType = typeof value;
  return valueType !== "object" && valueType !== "function";
}

function isRecordProjectStateValue(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
