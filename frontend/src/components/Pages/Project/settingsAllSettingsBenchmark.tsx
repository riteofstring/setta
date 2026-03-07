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
  "group-container-static-list",
  "param-flat-shell",
  "param-simple-grid-shell",
  "param-top-level-flat-shell",
  "param-top-level-simple-grid-shell",
  "param-top-level-structure-shell",
  "param-parent-structure-shell",
  "param-structure-shell",
  "param-chrome-shell",
  "param-container-shell",
  "param-input-shell",
  "non-text-widgets",
  "dropdown-widgets",
  "switch-widgets",
  "other-non-text-widgets",
  "non-text-widgets-no-dropdown",
  "code-widgets",
  "full",
  "full-section-snapdom",
  "full-section-opacity-hidden",
  "full-section-opacity-1pct",
  "full-section-snapdom-hidden-live",
] as const;

export type SettingsAllSettingsBenchmarkStage =
  (typeof SETTINGS_ALL_SETTINGS_BENCHMARK_STAGES)[number];

export type SettingsAllSettingsBenchmarkTextFamilyWidgetScope =
  | "all"
  | "none"
  | "code-only"
  | "text-only"
  | "text-area-only";

export type SettingsAllSettingsBenchmarkNonTextWidgetScope =
  | "all"
  | "dropdown-only"
  | "switch-only"
  | "other-only"
  | "all-except-dropdown";

type SettingsAllSettingsBenchmarkValue = {
  active: boolean;
  stage: SettingsAllSettingsBenchmarkStage;
  renderSectionHeader: boolean;
  renderSectionBody: boolean;
  renderFullSectionBody: boolean;
  useSyntheticSectionBody: boolean;
  renderStaticParamList: boolean;
  renderGroupContainerStaticRows: boolean;
  renderSectionHandles: boolean;
  renderLiveParamLabels: boolean;
  renderFlatParamLayout: boolean;
  renderSimpleGridParamLayout: boolean;
  renderNestedChildSubtrees: boolean;
  paramStructureScope: "all" | "parent-only";
  renderParamInput: boolean;
  renderParamWidgets: boolean;
  textFamilyWidgetScope: SettingsAllSettingsBenchmarkTextFamilyWidgetScope;
  nonTextWidgetScope?: SettingsAllSettingsBenchmarkNonTextWidgetScope;
  renderParamChrome: boolean;
  renderParamSortable: boolean;
  renderSectionBodySnapdomPreview: boolean;
  sectionBodyHiddenOpacity?: number | null;
  keepSectionBodyMountedWithSnapdomPreview?: boolean;
};

const DEFAULT_STAGE: SettingsAllSettingsBenchmarkStage = "full";

const DEFAULT_VALUE: SettingsAllSettingsBenchmarkValue = {
  active: false,
  stage: DEFAULT_STAGE,
  renderSectionHeader: true,
  renderSectionBody: true,
  renderFullSectionBody: true,
  useSyntheticSectionBody: false,
  renderStaticParamList: false,
  renderGroupContainerStaticRows: false,
  renderSectionHandles: true,
  renderLiveParamLabels: true,
  renderFlatParamLayout: false,
  renderSimpleGridParamLayout: false,
  renderNestedChildSubtrees: true,
  paramStructureScope: "all",
  renderParamInput: true,
  renderParamWidgets: true,
  textFamilyWidgetScope: "all",
  nonTextWidgetScope: "all",
  renderParamChrome: true,
  renderParamSortable: true,
  renderSectionBodySnapdomPreview: false,
  sectionBodyHiddenOpacity: null,
  keepSectionBodyMountedWithSnapdomPreview: false,
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
        useSyntheticSectionBody: false,
        renderStaticParamList: false,
        renderGroupContainerStaticRows: false,
        renderSectionHandles: false,
        renderLiveParamLabels: false,
        renderFlatParamLayout: false,
        renderSimpleGridParamLayout: false,
        renderNestedChildSubtrees: false,
        paramStructureScope: "all",
        renderParamInput: false,
        renderParamWidgets: false,
        textFamilyWidgetScope: "none",
        renderParamChrome: false,
        renderParamSortable: false,
        renderSectionBodySnapdomPreview: false,
        sectionBodyHiddenOpacity: null,
      };
    case "header-only":
      return {
        active: true,
        stage,
        renderSectionHeader: true,
        renderSectionBody: false,
        renderFullSectionBody: false,
        useSyntheticSectionBody: false,
        renderStaticParamList: false,
        renderGroupContainerStaticRows: false,
        renderSectionHandles: false,
        renderLiveParamLabels: false,
        renderFlatParamLayout: false,
        renderSimpleGridParamLayout: false,
        renderNestedChildSubtrees: false,
        paramStructureScope: "all",
        renderParamInput: false,
        renderParamWidgets: false,
        textFamilyWidgetScope: "none",
        renderParamChrome: false,
        renderParamSortable: false,
        renderSectionBodySnapdomPreview: false,
        sectionBodyHiddenOpacity: null,
      };
    case "section-body-shell":
      return {
        active: true,
        stage,
        renderSectionHeader: true,
        renderSectionBody: true,
        renderFullSectionBody: false,
        useSyntheticSectionBody: true,
        renderStaticParamList: false,
        renderGroupContainerStaticRows: false,
        renderSectionHandles: false,
        renderLiveParamLabels: false,
        renderFlatParamLayout: false,
        renderSimpleGridParamLayout: false,
        renderNestedChildSubtrees: false,
        paramStructureScope: "all",
        renderParamInput: false,
        renderParamWidgets: false,
        textFamilyWidgetScope: "none",
        renderParamChrome: false,
        renderParamSortable: false,
        renderSectionBodySnapdomPreview: false,
        sectionBodyHiddenOpacity: null,
      };
    case "static-param-list":
      return {
        active: true,
        stage,
        renderSectionHeader: true,
        renderSectionBody: true,
        renderFullSectionBody: false,
        useSyntheticSectionBody: true,
        renderStaticParamList: true,
        renderGroupContainerStaticRows: false,
        renderSectionHandles: false,
        renderLiveParamLabels: false,
        renderFlatParamLayout: false,
        renderSimpleGridParamLayout: false,
        renderNestedChildSubtrees: false,
        paramStructureScope: "all",
        renderParamInput: false,
        renderParamWidgets: false,
        textFamilyWidgetScope: "none",
        renderParamChrome: false,
        renderParamSortable: false,
        renderSectionBodySnapdomPreview: false,
        sectionBodyHiddenOpacity: null,
      };
    case "group-container-static-list":
      return {
        active: true,
        stage,
        renderSectionHeader: true,
        renderSectionBody: true,
        renderFullSectionBody: true,
        useSyntheticSectionBody: false,
        renderStaticParamList: false,
        renderGroupContainerStaticRows: true,
        renderSectionHandles: false,
        renderLiveParamLabels: false,
        renderFlatParamLayout: false,
        renderSimpleGridParamLayout: false,
        renderNestedChildSubtrees: false,
        paramStructureScope: "all",
        renderParamInput: false,
        renderParamWidgets: false,
        textFamilyWidgetScope: "none",
        renderParamChrome: false,
        renderParamSortable: false,
        renderSectionBodySnapdomPreview: false,
      };
    case "param-flat-shell":
      return {
        active: true,
        stage,
        renderSectionHeader: true,
        renderSectionBody: true,
        renderFullSectionBody: true,
        useSyntheticSectionBody: false,
        renderStaticParamList: false,
        renderGroupContainerStaticRows: false,
        renderSectionHandles: false,
        renderLiveParamLabels: false,
        renderFlatParamLayout: true,
        renderSimpleGridParamLayout: false,
        renderNestedChildSubtrees: true,
        paramStructureScope: "all",
        renderParamInput: false,
        renderParamWidgets: false,
        textFamilyWidgetScope: "none",
        renderParamChrome: false,
        renderParamSortable: false,
        renderSectionBodySnapdomPreview: false,
      };
    case "param-simple-grid-shell":
      return {
        active: true,
        stage,
        renderSectionHeader: true,
        renderSectionBody: true,
        renderFullSectionBody: true,
        useSyntheticSectionBody: false,
        renderStaticParamList: false,
        renderGroupContainerStaticRows: false,
        renderSectionHandles: false,
        renderLiveParamLabels: false,
        renderFlatParamLayout: false,
        renderSimpleGridParamLayout: true,
        renderNestedChildSubtrees: true,
        paramStructureScope: "all",
        renderParamInput: false,
        renderParamWidgets: false,
        textFamilyWidgetScope: "none",
        renderParamChrome: false,
        renderParamSortable: false,
        renderSectionBodySnapdomPreview: false,
      };
    case "param-top-level-flat-shell":
      return {
        active: true,
        stage,
        renderSectionHeader: true,
        renderSectionBody: true,
        renderFullSectionBody: true,
        useSyntheticSectionBody: false,
        renderStaticParamList: false,
        renderGroupContainerStaticRows: false,
        renderSectionHandles: false,
        renderLiveParamLabels: false,
        renderFlatParamLayout: true,
        renderSimpleGridParamLayout: false,
        renderNestedChildSubtrees: false,
        paramStructureScope: "all",
        renderParamInput: false,
        renderParamWidgets: false,
        textFamilyWidgetScope: "none",
        renderParamChrome: false,
        renderParamSortable: false,
        renderSectionBodySnapdomPreview: false,
      };
    case "param-top-level-simple-grid-shell":
      return {
        active: true,
        stage,
        renderSectionHeader: true,
        renderSectionBody: true,
        renderFullSectionBody: true,
        useSyntheticSectionBody: false,
        renderStaticParamList: false,
        renderGroupContainerStaticRows: false,
        renderSectionHandles: false,
        renderLiveParamLabels: false,
        renderFlatParamLayout: false,
        renderSimpleGridParamLayout: true,
        renderNestedChildSubtrees: false,
        paramStructureScope: "all",
        renderParamInput: false,
        renderParamWidgets: false,
        textFamilyWidgetScope: "none",
        renderParamChrome: false,
        renderParamSortable: false,
        renderSectionBodySnapdomPreview: false,
      };
    case "param-top-level-structure-shell":
      return {
        active: true,
        stage,
        renderSectionHeader: true,
        renderSectionBody: true,
        renderFullSectionBody: true,
        useSyntheticSectionBody: false,
        renderStaticParamList: false,
        renderGroupContainerStaticRows: false,
        renderSectionHandles: false,
        renderLiveParamLabels: false,
        renderFlatParamLayout: false,
        renderSimpleGridParamLayout: false,
        renderNestedChildSubtrees: false,
        paramStructureScope: "all",
        renderParamInput: false,
        renderParamWidgets: false,
        textFamilyWidgetScope: "none",
        renderParamChrome: false,
        renderParamSortable: false,
        renderSectionBodySnapdomPreview: false,
      };
    case "param-parent-structure-shell":
      return {
        active: true,
        stage,
        renderSectionHeader: true,
        renderSectionBody: true,
        renderFullSectionBody: true,
        useSyntheticSectionBody: false,
        renderStaticParamList: false,
        renderGroupContainerStaticRows: false,
        renderSectionHandles: false,
        renderLiveParamLabels: false,
        renderFlatParamLayout: false,
        renderSimpleGridParamLayout: false,
        renderNestedChildSubtrees: true,
        paramStructureScope: "parent-only",
        renderParamInput: false,
        renderParamWidgets: false,
        textFamilyWidgetScope: "none",
        renderParamChrome: false,
        renderParamSortable: false,
        renderSectionBodySnapdomPreview: false,
      };
    case "param-structure-shell":
      return {
        active: true,
        stage,
        renderSectionHeader: true,
        renderSectionBody: true,
        renderFullSectionBody: true,
        useSyntheticSectionBody: false,
        renderStaticParamList: false,
        renderGroupContainerStaticRows: false,
        renderSectionHandles: false,
        renderLiveParamLabels: false,
        renderFlatParamLayout: false,
        renderSimpleGridParamLayout: false,
        renderNestedChildSubtrees: true,
        paramStructureScope: "all",
        renderParamInput: false,
        renderParamWidgets: false,
        textFamilyWidgetScope: "none",
        renderParamChrome: false,
        renderParamSortable: false,
      };
    case "param-chrome-shell":
      return {
        active: true,
        stage,
        renderSectionHeader: true,
        renderSectionBody: true,
        renderFullSectionBody: true,
        useSyntheticSectionBody: false,
        renderStaticParamList: false,
        renderGroupContainerStaticRows: false,
        renderSectionHandles: false,
        renderLiveParamLabels: false,
        renderFlatParamLayout: false,
        renderSimpleGridParamLayout: false,
        renderNestedChildSubtrees: true,
        paramStructureScope: "all",
        renderParamInput: false,
        renderParamWidgets: false,
        textFamilyWidgetScope: "none",
        renderParamChrome: true,
        renderParamSortable: false,
        renderSectionBodySnapdomPreview: false,
      };
    case "param-container-shell":
      return {
        active: true,
        stage,
        renderSectionHeader: true,
        renderSectionBody: true,
        renderFullSectionBody: true,
        useSyntheticSectionBody: false,
        renderStaticParamList: false,
        renderGroupContainerStaticRows: false,
        renderSectionHandles: false,
        renderLiveParamLabels: false,
        renderFlatParamLayout: false,
        renderSimpleGridParamLayout: false,
        renderNestedChildSubtrees: true,
        paramStructureScope: "all",
        renderParamInput: false,
        renderParamWidgets: false,
        textFamilyWidgetScope: "none",
        renderParamChrome: true,
        renderParamSortable: true,
        renderSectionBodySnapdomPreview: false,
      };
    case "param-input-shell":
      return {
        active: true,
        stage,
        renderSectionHeader: true,
        renderSectionBody: true,
        renderFullSectionBody: true,
        useSyntheticSectionBody: false,
        renderStaticParamList: false,
        renderGroupContainerStaticRows: false,
        renderSectionHandles: false,
        renderLiveParamLabels: false,
        renderFlatParamLayout: false,
        renderSimpleGridParamLayout: false,
        renderNestedChildSubtrees: true,
        paramStructureScope: "all",
        renderParamInput: true,
        renderParamWidgets: false,
        textFamilyWidgetScope: "none",
        renderParamChrome: true,
        renderParamSortable: true,
        renderSectionBodySnapdomPreview: false,
      };
    case "non-text-widgets":
      return {
        active: true,
        stage,
        renderSectionHeader: true,
        renderSectionBody: true,
        renderFullSectionBody: true,
        useSyntheticSectionBody: false,
        renderStaticParamList: false,
        renderGroupContainerStaticRows: false,
        renderSectionHandles: false,
        renderLiveParamLabels: false,
        renderFlatParamLayout: false,
        renderSimpleGridParamLayout: false,
        renderNestedChildSubtrees: true,
        paramStructureScope: "all",
        renderParamInput: true,
        renderParamWidgets: true,
        textFamilyWidgetScope: "none",
        nonTextWidgetScope: "all",
        renderParamChrome: true,
        renderParamSortable: true,
        renderSectionBodySnapdomPreview: false,
      };
    case "dropdown-widgets":
      return {
        active: true,
        stage,
        renderSectionHeader: true,
        renderSectionBody: true,
        renderFullSectionBody: true,
        useSyntheticSectionBody: false,
        renderStaticParamList: false,
        renderGroupContainerStaticRows: false,
        renderSectionHandles: false,
        renderLiveParamLabels: false,
        renderFlatParamLayout: false,
        renderSimpleGridParamLayout: false,
        renderNestedChildSubtrees: true,
        paramStructureScope: "all",
        renderParamInput: true,
        renderParamWidgets: true,
        textFamilyWidgetScope: "none",
        nonTextWidgetScope: "dropdown-only",
        renderParamChrome: true,
        renderParamSortable: true,
        renderSectionBodySnapdomPreview: false,
      };
    case "switch-widgets":
      return {
        active: true,
        stage,
        renderSectionHeader: true,
        renderSectionBody: true,
        renderFullSectionBody: true,
        useSyntheticSectionBody: false,
        renderStaticParamList: false,
        renderGroupContainerStaticRows: false,
        renderSectionHandles: false,
        renderLiveParamLabels: false,
        renderFlatParamLayout: false,
        renderSimpleGridParamLayout: false,
        renderNestedChildSubtrees: true,
        paramStructureScope: "all",
        renderParamInput: true,
        renderParamWidgets: true,
        textFamilyWidgetScope: "none",
        nonTextWidgetScope: "switch-only",
        renderParamChrome: true,
        renderParamSortable: true,
        renderSectionBodySnapdomPreview: false,
      };
    case "other-non-text-widgets":
      return {
        active: true,
        stage,
        renderSectionHeader: true,
        renderSectionBody: true,
        renderFullSectionBody: true,
        useSyntheticSectionBody: false,
        renderStaticParamList: false,
        renderGroupContainerStaticRows: false,
        renderSectionHandles: false,
        renderLiveParamLabels: false,
        renderFlatParamLayout: false,
        renderSimpleGridParamLayout: false,
        renderNestedChildSubtrees: true,
        paramStructureScope: "all",
        renderParamInput: true,
        renderParamWidgets: true,
        textFamilyWidgetScope: "none",
        nonTextWidgetScope: "other-only",
        renderParamChrome: true,
        renderParamSortable: true,
        renderSectionBodySnapdomPreview: false,
      };
    case "non-text-widgets-no-dropdown":
      return {
        active: true,
        stage,
        renderSectionHeader: true,
        renderSectionBody: true,
        renderFullSectionBody: true,
        useSyntheticSectionBody: false,
        renderStaticParamList: false,
        renderGroupContainerStaticRows: false,
        renderSectionHandles: false,
        renderLiveParamLabels: false,
        renderFlatParamLayout: false,
        renderSimpleGridParamLayout: false,
        renderNestedChildSubtrees: true,
        paramStructureScope: "all",
        renderParamInput: true,
        renderParamWidgets: true,
        textFamilyWidgetScope: "none",
        nonTextWidgetScope: "all-except-dropdown",
        renderParamChrome: true,
        renderParamSortable: true,
        renderSectionBodySnapdomPreview: false,
      };
    case "code-widgets":
      return {
        active: true,
        stage,
        renderSectionHeader: true,
        renderSectionBody: true,
        renderFullSectionBody: true,
        useSyntheticSectionBody: false,
        renderStaticParamList: false,
        renderGroupContainerStaticRows: false,
        renderSectionHandles: false,
        renderLiveParamLabels: false,
        renderFlatParamLayout: false,
        renderSimpleGridParamLayout: false,
        renderNestedChildSubtrees: true,
        paramStructureScope: "all",
        renderParamInput: true,
        renderParamWidgets: true,
        textFamilyWidgetScope: "code-only",
        nonTextWidgetScope: "all",
        renderParamChrome: true,
        renderParamSortable: true,
        renderSectionBodySnapdomPreview: false,
      };
    case "full":
      return {
        active: true,
        stage,
        renderSectionHeader: true,
        renderSectionBody: true,
        renderFullSectionBody: true,
        useSyntheticSectionBody: false,
        renderStaticParamList: false,
        renderGroupContainerStaticRows: false,
        renderSectionHandles: true,
        renderLiveParamLabels: true,
        renderFlatParamLayout: false,
        renderSimpleGridParamLayout: false,
        renderNestedChildSubtrees: true,
        paramStructureScope: "all",
        renderParamInput: true,
        renderParamWidgets: true,
        textFamilyWidgetScope: "all",
        nonTextWidgetScope: "all",
        renderParamChrome: true,
        renderParamSortable: true,
        renderSectionBodySnapdomPreview: false,
        sectionBodyHiddenOpacity: null,
      };
    case "full-section-snapdom":
      return {
        active: true,
        stage,
        renderSectionHeader: true,
        renderSectionBody: true,
        renderFullSectionBody: true,
        useSyntheticSectionBody: false,
        renderStaticParamList: false,
        renderGroupContainerStaticRows: false,
        renderSectionHandles: true,
        renderLiveParamLabels: true,
        renderFlatParamLayout: false,
        renderSimpleGridParamLayout: false,
        renderNestedChildSubtrees: true,
        paramStructureScope: "all",
        renderParamInput: true,
        renderParamWidgets: true,
        textFamilyWidgetScope: "all",
        nonTextWidgetScope: "all",
        renderParamChrome: true,
        renderParamSortable: true,
        renderSectionBodySnapdomPreview: true,
        sectionBodyHiddenOpacity: null,
        keepSectionBodyMountedWithSnapdomPreview: false,
      };
    case "full-section-opacity-hidden":
      return {
        active: true,
        stage,
        renderSectionHeader: true,
        renderSectionBody: true,
        renderFullSectionBody: true,
        useSyntheticSectionBody: false,
        renderStaticParamList: false,
        renderGroupContainerStaticRows: false,
        renderSectionHandles: true,
        renderLiveParamLabels: true,
        renderFlatParamLayout: false,
        renderSimpleGridParamLayout: false,
        renderNestedChildSubtrees: true,
        paramStructureScope: "all",
        renderParamInput: true,
        renderParamWidgets: true,
        textFamilyWidgetScope: "all",
        nonTextWidgetScope: "all",
        renderParamChrome: true,
        renderParamSortable: true,
        renderSectionBodySnapdomPreview: false,
        sectionBodyHiddenOpacity: 0,
        keepSectionBodyMountedWithSnapdomPreview: false,
      };
    case "full-section-opacity-1pct":
      return {
        active: true,
        stage,
        renderSectionHeader: true,
        renderSectionBody: true,
        renderFullSectionBody: true,
        useSyntheticSectionBody: false,
        renderStaticParamList: false,
        renderGroupContainerStaticRows: false,
        renderSectionHandles: true,
        renderLiveParamLabels: true,
        renderFlatParamLayout: false,
        renderSimpleGridParamLayout: false,
        renderNestedChildSubtrees: true,
        paramStructureScope: "all",
        renderParamInput: true,
        renderParamWidgets: true,
        textFamilyWidgetScope: "all",
        nonTextWidgetScope: "all",
        renderParamChrome: true,
        renderParamSortable: true,
        renderSectionBodySnapdomPreview: false,
        sectionBodyHiddenOpacity: 0.01,
        keepSectionBodyMountedWithSnapdomPreview: false,
      };
    case "full-section-snapdom-hidden-live":
      return {
        active: true,
        stage,
        renderSectionHeader: true,
        renderSectionBody: true,
        renderFullSectionBody: true,
        useSyntheticSectionBody: false,
        renderStaticParamList: false,
        renderGroupContainerStaticRows: false,
        renderSectionHandles: true,
        renderLiveParamLabels: true,
        renderFlatParamLayout: false,
        renderSimpleGridParamLayout: false,
        renderNestedChildSubtrees: true,
        paramStructureScope: "all",
        renderParamInput: true,
        renderParamWidgets: true,
        textFamilyWidgetScope: "all",
        nonTextWidgetScope: "all",
        renderParamChrome: true,
        renderParamSortable: true,
        renderSectionBodySnapdomPreview: true,
        sectionBodyHiddenOpacity: null,
        keepSectionBodyMountedWithSnapdomPreview: true,
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
