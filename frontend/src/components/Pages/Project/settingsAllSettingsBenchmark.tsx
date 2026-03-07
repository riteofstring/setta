import _ from "lodash";
import {
  createContext,
  useContext,
  useMemo,
  type PropsWithChildren,
} from "react";
import { useLocation } from "react-router-dom";
import { useProjectState } from "state/definitions";
import { C } from "utils/c";

export const SETTINGS_ALL_SETTINGS_BENCHMARK_QUERY_PARAM =
  "settingsBenchmarkStage";

export const SETTINGS_ALL_SETTINGS_BENCHMARK_STAGES = [
  "frame-only",
  "header-only",
  "section-body-shell",
  "static-param-list",
  "full",
] as const;

export type SettingsAllSettingsBenchmarkStage =
  (typeof SETTINGS_ALL_SETTINGS_BENCHMARK_STAGES)[number];

type SettingsAllSettingsBenchmarkValue = {
  active: boolean;
  stage: SettingsAllSettingsBenchmarkStage;
  renderSectionHeader: boolean;
  renderSectionBody: boolean;
  renderFullSectionBody: boolean;
  renderStaticParamList: boolean;
  renderSectionHandles: boolean;
};

const DEFAULT_STAGE: SettingsAllSettingsBenchmarkStage = "full";

const DEFAULT_VALUE: SettingsAllSettingsBenchmarkValue = {
  active: false,
  stage: DEFAULT_STAGE,
  renderSectionHeader: true,
  renderSectionBody: true,
  renderFullSectionBody: true,
  renderStaticParamList: false,
  renderSectionHandles: true,
};

const SettingsAllSettingsBenchmarkContext =
  createContext<SettingsAllSettingsBenchmarkValue>(DEFAULT_VALUE);

function isSettingsAllSettingsBenchmarkStage(
  value: string | null,
): value is SettingsAllSettingsBenchmarkStage {
  if (value === null) {
    return false;
  }
  return SETTINGS_ALL_SETTINGS_BENCHMARK_STAGES.includes(
    value as SettingsAllSettingsBenchmarkStage,
  );
}

function resolveBenchmarkValue(
  stage: SettingsAllSettingsBenchmarkStage | null,
  projectName: string | null,
  activeViewModeName: string | null,
): SettingsAllSettingsBenchmarkValue {
  if (
    stage === null ||
    projectName?.toLowerCase() !== C.SETTINGS_PROJECT_NAME.toLowerCase() ||
    activeViewModeName !== "All Settings"
  ) {
    return DEFAULT_VALUE;
  }

  switch (stage) {
    case "frame-only":
      return {
        active: true,
        stage,
        renderSectionHeader: false,
        renderSectionBody: false,
        renderFullSectionBody: false,
        renderStaticParamList: false,
        renderSectionHandles: false,
      };
    case "header-only":
      return {
        active: true,
        stage,
        renderSectionHeader: true,
        renderSectionBody: false,
        renderFullSectionBody: false,
        renderStaticParamList: false,
        renderSectionHandles: false,
      };
    case "section-body-shell":
      return {
        active: true,
        stage,
        renderSectionHeader: true,
        renderSectionBody: true,
        renderFullSectionBody: false,
        renderStaticParamList: false,
        renderSectionHandles: false,
      };
    case "static-param-list":
      return {
        active: true,
        stage,
        renderSectionHeader: true,
        renderSectionBody: true,
        renderFullSectionBody: false,
        renderStaticParamList: true,
        renderSectionHandles: false,
      };
    case "full":
      return {
        active: true,
        stage,
        renderSectionHeader: true,
        renderSectionBody: true,
        renderFullSectionBody: true,
        renderStaticParamList: false,
        renderSectionHandles: true,
      };
    default:
      return stage satisfies never;
  }
}

export function SettingsAllSettingsBenchmarkProvider({
  children,
}: PropsWithChildren) {
  const location = useLocation();
  const { projectName, activeViewModeName } = useProjectState((state) => {
    const { projectConfig } = state;
    const activeViewModeId = projectConfig.activeViewModeId;
    const activeViewMode = activeViewModeId
      ? projectConfig.viewModes[activeViewModeId] ?? null
      : null;
    return {
      projectName: projectConfig.name ?? null,
      activeViewModeName: activeViewMode?.name ?? null,
    };
  }, _.isEqual);

  const requestedStage = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const value = params.get(SETTINGS_ALL_SETTINGS_BENCHMARK_QUERY_PARAM);
    return isSettingsAllSettingsBenchmarkStage(value) ? value : null;
  }, [location.search]);

  const value = useMemo(
    () =>
      resolveBenchmarkValue(requestedStage, projectName, activeViewModeName),
    [activeViewModeName, projectName, requestedStage],
  );

  return (
    <SettingsAllSettingsBenchmarkContext.Provider value={value}>
      {children}
    </SettingsAllSettingsBenchmarkContext.Provider>
  );
}

export function useSettingsAllSettingsBenchmark() {
  return useContext(SettingsAllSettingsBenchmarkContext);
}
