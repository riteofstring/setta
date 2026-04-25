import {
  PluginListResponse,
  PluginRuntimeStateEnum,
  type PluginBlockedCapability,
  type PluginStatusEntry,
} from "utils/generatedTypes";
import { type PluginPaneIconName } from "./paneIcons";

export const PluginFrontendErrorCodeEnum = {
  RegistrationInvalid: "PLUGIN_FRONTEND_REGISTRATION_INVALID",
  ApiVersionMismatch: "PLUGIN_FRONTEND_API_VERSION_MISMATCH",
  CapabilityDenied: "PLUGIN_CAPABILITY_DENIED",
  FrontendLoadFailed: "PLUGIN_FRONTEND_LOAD_FAILED",
} as const;

export type PluginFrontendErrorCode =
  (typeof PluginFrontendErrorCodeEnum)[keyof typeof PluginFrontendErrorCodeEnum];

export type PluginSectionFallbackReason =
  | "plugin_disabled"
  | "plugin_not_installed"
  | "frontend_load_failed"
  | "section_kind_missing"
  | "mode_blocked";

export type PluginServerMode = PluginListResponse["serverMode"];

type PluginPaneProps = {
  pluginId: string;
  serverMode: PluginServerMode;
  effectiveCapabilities: string[];
};

type PluginPaneRenderer = {
  mount: (el: HTMLElement, props: PluginPaneProps) => void;
  update?: (el: HTMLElement, props: PluginPaneProps) => void;
  unmount?: (el: HTMLElement) => void;
};

export type PluginPaneDefinition = {
  id: string;
  title: string;
  description?: string;
  icon?: PluginPaneIconName;
  renderer: PluginPaneRenderer;
};

export type RegisteredPluginPane = PluginPaneDefinition & {
  pluginId: string;
};

export const PluginCanvasControlPlacementEnum = {
  Project: "project",
  Viewport: "viewport",
  Utility: "utility",
} as const;

export type PluginCanvasControlPlacement =
  (typeof PluginCanvasControlPlacementEnum)[keyof typeof PluginCanvasControlPlacementEnum];

export function isPluginCanvasControlPlacement(
  value: string,
): value is PluginCanvasControlPlacement {
  return (
    value === PluginCanvasControlPlacementEnum.Project ||
    value === PluginCanvasControlPlacementEnum.Viewport ||
    value === PluginCanvasControlPlacementEnum.Utility
  );
}

type PluginCanvasControlProps = {
  pluginId: string;
  controlId: string;
  label: string;
  placement: PluginCanvasControlPlacement;
  serverMode: PluginServerMode;
  effectiveCapabilities: string[];
};

type PluginCanvasControlRenderer = {
  mount: (el: HTMLElement, props: PluginCanvasControlProps) => void;
  update?: (el: HTMLElement, props: PluginCanvasControlProps) => void;
  unmount?: (el: HTMLElement) => void;
};

export type PluginCanvasControlDefinition = {
  id: string;
  label: string;
  description?: string;
  placement?: PluginCanvasControlPlacement;
  order?: number;
  renderer: PluginCanvasControlRenderer;
};

export type RegisteredPluginCanvasControl = PluginCanvasControlDefinition & {
  pluginId: string;
  placement: PluginCanvasControlPlacement;
};

type PluginSectionFallbackState = {
  pluginStatusById: Record<
    string,
    Pick<
      PluginStatusEntry,
      "state" | "blockedCapabilities" | "effectiveCapabilities"
    >
  >;
  frontendErrorsByPluginId: Record<string, unknown>;
  sectionKindsByKey: Record<string, unknown>;
};

const sectionKindCapability = "registerSectionKinds";

export function toPluginSectionKindKey(pluginId: string, kind: string): string {
  return `${pluginId}::${kind}`;
}

function isCapabilityBlocked(
  blockedCapabilities: PluginBlockedCapability[],
  capability: string,
): boolean {
  for (const blockedCapability of blockedCapabilities) {
    if (blockedCapability.capability === capability) {
      return true;
    }
  }
  return false;
}

export function computePluginSectionFallbackReason(
  state: PluginSectionFallbackState,
  pluginId: string,
  kind: string,
): PluginSectionFallbackReason | null {
  const statusEntry = state.pluginStatusById[pluginId];
  if (!statusEntry) {
    return "plugin_not_installed";
  }
  if (statusEntry.state === PluginRuntimeStateEnum.disabled) {
    return "plugin_disabled";
  }
  if (
    isCapabilityBlocked(
      statusEntry.blockedCapabilities,
      sectionKindCapability,
    ) ||
    !statusEntry.effectiveCapabilities.includes(sectionKindCapability)
  ) {
    return "mode_blocked";
  }

  if (state.frontendErrorsByPluginId[pluginId]) {
    return "frontend_load_failed";
  }

  const sectionKindKey = toPluginSectionKindKey(pluginId, kind);
  if (!state.sectionKindsByKey[sectionKindKey]) {
    return "section_kind_missing";
  }

  return null;
}
