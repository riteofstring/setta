import type { GetLatestProjectStateResponse } from "@setta/app-subsystem-frontend-sdk";
import {
  createWithEqualityFn,
  withAppSubsystemResetFn,
} from "./appSubsystemStore";

export type AppProjectStateSnapshot =
  GetLatestProjectStateResponse["projectState"];
export type AppConfigState = AppProjectStateSnapshot & {
  previewSectionVariantMap: Record<string, string>;
};

type AppConfigsState = {
  configs: Record<string, AppConfigState>;
};

export const useAppConfigs = createWithEqualityFn(
  withAppSubsystemResetFn<AppConfigsState>(() => ({
    configs: {},
  })),
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

export const useAppPreview = createWithEqualityFn(
  withAppSubsystemResetFn<AppPreviewState>(() => ({
    isPreviewEnabled: false,
    previewConfigId: null,
    previewSpecOverride: undefined,
    aiPreviewSpecOverride: undefined,
    previewThemeOverride: undefined,
    previewAssetsOverride: undefined,
  })),
);
