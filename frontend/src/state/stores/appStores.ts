import type {
  AppDefinition,
  ProjectStateSingleConfig,
} from "utils/generatedTypes";
import { createWithEqualityFn } from "zustand/traditional";
import { withProjectState, withResetFn } from "../utils";

type AppDefinitionState = {
  appDefinition: AppDefinition | null;
  appSpec: unknown | null;
};

export const useAppDefinition = withProjectState(
  createWithEqualityFn(
    withResetFn<AppDefinitionState>(() => ({
      appDefinition: null,
      appSpec: null,
    })),
  ),
);

type AppConfigState = ProjectStateSingleConfig & {
  previewSectionVariantMap: Record<string, string>;
};

type AppConfigsState = {
  configs: Record<string, AppConfigState>;
};

export const useAppConfigs = withProjectState(
  createWithEqualityFn(
    withResetFn<AppConfigsState>(() => ({
      configs: {},
    })),
  ),
);

type AppPreviewState = {
  isPreviewEnabled: boolean;
  previewConfigId: string | null;
  // Draft-only overrides used for live preview while editing App Config.
  // `undefined` means "no override"; `null` means "explicitly cleared".
  previewSpecOverride?: unknown | null;
  // AI-streaming override used while `setta__stream_app_definition` is streaming patches.
  aiPreviewSpecOverride?: unknown | null;
  previewThemeOverride?: unknown | null;
  previewAssetsOverride?: unknown[] | null;
};

export const useAppPreview = withProjectState(
  createWithEqualityFn(
    withResetFn<AppPreviewState>(() => ({
      isPreviewEnabled: false,
      previewConfigId: null,
      previewSpecOverride: undefined,
      aiPreviewSpecOverride: undefined,
      previewThemeOverride: undefined,
      previewAssetsOverride: undefined,
    })),
  ),
);
