import { AppRenderer } from "components/App/AppRenderer";
import { useEffect } from "react";
import {
  NULL_PROJECT_CONFIG_ID,
  useAllProjectMetadata,
  useAppConfigs,
  useAppDefinition,
  useAppPreview,
  useProjectState,
} from "state/definitions";
import { res200 } from "utils/endpointUtils";
import { route_load_project_config } from "utils/generatedEndpoints";

export function AppPreview() {
  const appSpec = useAppDefinition((x) => x.appSpec);
  const appDefinition = useAppDefinition((x) => x.appDefinition);
  const previewConfigId = useAppPreview((x) => x.previewConfigId);
  const appConfigs = useAppConfigs((x) => x.configs);
  const { projectMetadata } = useAllProjectMetadata((x) => x);
  const activeConfigId = useProjectState((x) => x.projectConfig.id);
  const projectState = useProjectState((x) => x);
  const resolvedConfigId =
    previewConfigId ??
    (activeConfigId !== NULL_PROJECT_CONFIG_ID ? activeConfigId : null);

  useEffect(() => {
    if (!activeConfigId || activeConfigId === NULL_PROJECT_CONFIG_ID) {
      return;
    }
    useAppConfigs.setState((state) => ({
      configs: {
        ...state.configs,
        [activeConfigId]: {
          ...projectState,
          previewSectionVariantMap: projectState.previewSectionVariantMap ?? {},
          appSpec: null,
        },
      },
    }));
  }, [activeConfigId, projectState]);

  useEffect(() => {
    if (
      !resolvedConfigId ||
      resolvedConfigId === activeConfigId ||
      resolvedConfigId === NULL_PROJECT_CONFIG_ID
    ) {
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
    let cancelled = false;
    async function loadConfig() {
      const res = await route_load_project_config({
        projectConfigName: configName,
      });
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
            appSpec: null,
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
          appSpec={appSpec}
          appDefinition={appDefinition}
          defaultConfigId={resolvedConfigId}
        />
      </div>
    </div>
  );
}
