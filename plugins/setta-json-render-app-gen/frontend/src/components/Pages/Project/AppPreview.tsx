import { AppRenderer } from "../../App/AppRenderer";
import {
  callOpenAPI,
  loadProjectConfig as loadProjectConfigRequest,
  res200,
  type ResponseDataAndStatus,
} from "@setta/app-subsystem-frontend-sdk";
import { useEffect, useMemo } from "react";
import {
  type AppProjectStateSnapshot,
  useAppConfigs,
  useAppPreview,
} from "../../../appSubsystemProjectState";
import {
  createAppDefinition,
  type AppDefinition,
} from "../../../appSubsystemContracts";
import { useAppDefinition } from "../../../appSubsystemDefinitionState";
import {
  useAppSubsystemProjectContext,
  useAppSubsystemProjectStateSnapshot,
} from "../../../appSubsystemFrontendHostContext";

type LoadProjectConfigRouteResponse =
  ResponseDataAndStatus<AppProjectStateSnapshot>;
export function AppPreview() {
  const appSpec = useAppDefinition((x) => x.appSpec);
  const appDefinition = useAppDefinition((x) => x.appDefinition);
  const previewConfigId = useAppPreview((x) => x.previewConfigId);
  const previewSpecOverride = useAppPreview((x) => x.previewSpecOverride);
  const aiPreviewSpecOverride = useAppPreview((x) => x.aiPreviewSpecOverride);
  const previewThemeOverride = useAppPreview((x) => x.previewThemeOverride);
  const previewAssetsOverride = useAppPreview((x) => x.previewAssetsOverride);
  const appConfigs = useAppConfigs((x) => x.configs);
  const { projectMetadata, projectConfig } = useAppSubsystemProjectContext();
  const projectState = useAppSubsystemProjectStateSnapshot();
  const activeConfigId = projectConfig.id;
  const resolvedConfigId = previewConfigId ?? activeConfigId;
  let previewSpec = appSpec;
  if (previewSpecOverride !== undefined) {
    previewSpec = previewSpecOverride;
  }
  if (aiPreviewSpecOverride !== undefined) {
    previewSpec = aiPreviewSpecOverride;
  }
  const previewDefinition = useMemo(() => {
    const hasOverrides =
      previewThemeOverride !== undefined || previewAssetsOverride !== undefined;
    if (!hasOverrides) {
      return appDefinition;
    }
    const base = appDefinition ?? createAppDefinition();
    return {
      ...base,
      theme:
        previewThemeOverride !== undefined
          ? (previewThemeOverride as AppDefinition["theme"])
          : base.theme,
      assets:
        previewAssetsOverride !== undefined
          ? ((previewAssetsOverride ?? []) as AppDefinition["assets"])
          : base.assets,
    } as AppDefinition;
  }, [appDefinition, previewAssetsOverride, previewThemeOverride]);
  useEffect(() => {
    if (!activeConfigId) {
      return;
    }
    useAppConfigs.setState((state) => ({
      configs: {
        ...state.configs,
        [activeConfigId]: {
          ...projectState,
          previewSectionVariantMap: projectState.previewSectionVariantMap,
        },
      },
    }));
  }, [activeConfigId, projectState]);
  useEffect(() => {
    if (!resolvedConfigId || resolvedConfigId === activeConfigId) {
      return;
    }
    if (appConfigs[resolvedConfigId]) {
      return;
    }
    const configName = projectMetadata.find(
      (config) => config.id === resolvedConfigId,
    )?.name;
    if (!configName) {
      return;
    }
    const resolvedConfigName = configName;
    let cancelled = false;
    async function loadConfig() {
      const res = (await callOpenAPI(
        loadProjectConfigRequest({
          body: {
            projectConfigName: resolvedConfigName,
          },
        } as Parameters<typeof loadProjectConfigRequest>[0]),
      )) as LoadProjectConfigRouteResponse;
      if (!res200(res) || cancelled) {
        return;
      }
      const nextState = res.data;
      useAppConfigs.setState((state) => ({
        configs: {
          ...state.configs,
          [nextState.projectConfig.id]: {
            ...nextState,
            previewSectionVariantMap: {},
          },
        },
      }));
    }
    void loadConfig();
    return () => {
      cancelled = true;
    };
  }, [activeConfigId, appConfigs, projectMetadata, resolvedConfigId]);
  return (
    <div className="flex h-full w-full flex-col overflow-auto bg-setta-50/70 dark:bg-setta-950/60">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-6 py-6">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-setta-400 dark:text-setta-500">
            App Preview
          </div>
        </div>
        <AppRenderer
          appSpec={previewSpec}
          appDefinition={previewDefinition}
          defaultConfigId={resolvedConfigId}
        />
      </div>
    </div>
  );
}
