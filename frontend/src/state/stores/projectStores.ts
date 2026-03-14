import {
  AllProjectMetadata,
  AppDefinition,
  createProjectChatWindowingState,
  createProjectConfig,
  createSingletonSections,
  ProjectStateSingleConfig,
} from "utils/generatedTypes";
import { subscribeWithSelector } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { createWithEqualityFn } from "zustand/traditional";
import { withProjectState, withResetFn } from "../utils";

export type ZustandProjectState = ProjectStateSingleConfig & {
  previewSectionVariantMap: Record<string, string>;
};

export const NULL_PROJECT_CONFIG_ID = "null";

export const useProjectState = withProjectState(
  createWithEqualityFn(
    subscribeWithSelector(
      immer(
        withResetFn<ZustandProjectState>(() => ({
          projectConfig: createProjectConfig({ id: NULL_PROJECT_CONFIG_ID }),
          sections: {},
          sectionImpls: {},
          sectionVariants: {},
          codeObjs: {},
          codeObjImpls: {},
          codeObjVariants: {},
          artifactGroups: {},
          singletonSections: createSingletonSections(),
          parentSectionMap: {},
          shownParamIds: {},
          projectChatWindowing: createProjectChatWindowingState(),
          previewSectionVariantMap: {},
          requiredDecodedImages: [],
        })),
      ),
    ),
  ),
);

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

type AppConfigState = ZustandProjectState;

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
  previewSpecOverride?: unknown | null;
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

export const useAllProjectMetadata = createWithEqualityFn(
  withResetFn<AllProjectMetadata>(() => ({
    defaultProjectConfigId: null,
    projectMetadata: [],
  })),
);

export type PendingOperation = {
  opId: string;
  apply: (x: ZustandProjectState) => void;
  acknowledged: boolean;
};

type ZustandPendingOperations = {
  pending: Array<PendingOperation>;
};

export const usePendingOperations = withProjectState(
  createWithEqualityFn(
    withResetFn<ZustandPendingOperations>(() => ({ pending: [] })),
  ),
);
