import _ from "lodash";
import {
  createContext,
  useContext,
  useEffect,
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
  "full-ui-editor-shell",
  "full-no-zindex",
  "full-ui-active-store",
  "full",
  "full-section-snapdom",
  "full-section-opacity-hidden",
  "full-section-opacity-1pct",
  "full-section-snapdom-hidden-live",
  "full-section-semantic-preview-hidden-live",
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

export const SETTINGS_ALL_SETTINGS_BENCHMARK_RENDER_COUNTER_SCOPES = [
  "section-shell",
  "section-core-resizable",
  "section-header",
  "section-title-active",
  "kwargs-controls",
  "param-filter",
  "get-param-switch",
  "param-switch",
  "param-container",
  "ui-editor",
  "minimap-nodes",
  "agentic-edge-renderer",
  "edge-renderer",
  "nodes-selection",
] as const;

export type SettingsAllSettingsBenchmarkRenderCounterScope =
  (typeof SETTINGS_ALL_SETTINGS_BENCHMARK_RENDER_COUNTER_SCOPES)[number];

type SettingsAllSettingsBenchmarkRenderCounterEntry = {
  commitCount: number;
  entities: Record<string, number>;
};

export type SettingsAllSettingsBenchmarkRenderCounterSnapshot = {
  stage: SettingsAllSettingsBenchmarkStage | "off";
  commitSequence: number;
  counters: Record<
    SettingsAllSettingsBenchmarkRenderCounterScope,
    SettingsAllSettingsBenchmarkRenderCounterEntry
  >;
};

declare global {
  interface Window {
    __settaSettingsBenchmarkRenderCounters?:
      | SettingsAllSettingsBenchmarkRenderCounterSnapshot
      | undefined;
  }
}

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
  renderUiEditorContent?: boolean;
  skipActivationZIndexReorder?: boolean;
  renderSectionBodySnapdomPreview: boolean;
  renderSectionBodySemanticPreview?: boolean;
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
  renderUiEditorContent: true,
  skipActivationZIndexReorder: false,
  renderSectionBodySnapdomPreview: false,
  renderSectionBodySemanticPreview: false,
  sectionBodyHiddenOpacity: null,
  keepSectionBodyMountedWithSnapdomPreview: false,
};

const SettingsAllSettingsBenchmarkContext =
  createContext<SettingsAllSettingsBenchmarkValue>(DEFAULT_VALUE);

function createEmptySettingsAllSettingsBenchmarkRenderCounters(): Record<
  SettingsAllSettingsBenchmarkRenderCounterScope,
  SettingsAllSettingsBenchmarkRenderCounterEntry
> {
  return Object.fromEntries(
    SETTINGS_ALL_SETTINGS_BENCHMARK_RENDER_COUNTER_SCOPES.map((scope) => [
      scope,
      { commitCount: 0, entities: {} },
    ]),
  ) as Record<
    SettingsAllSettingsBenchmarkRenderCounterScope,
    SettingsAllSettingsBenchmarkRenderCounterEntry
  >;
}

function getSettingsAllSettingsBenchmarkRenderCounterStore(): SettingsAllSettingsBenchmarkRenderCounterSnapshot | null {
  if (typeof window === "undefined") {
    return null;
  }
  if (!window.__settaSettingsBenchmarkRenderCounters) {
    window.__settaSettingsBenchmarkRenderCounters = {
      stage: "off",
      commitSequence: 0,
      counters: createEmptySettingsAllSettingsBenchmarkRenderCounters(),
    };
  }
  return window.__settaSettingsBenchmarkRenderCounters;
}

export function setSettingsAllSettingsBenchmarkRenderCounterStage(
  stage: SettingsAllSettingsBenchmarkStage | "off",
) {
  const store = getSettingsAllSettingsBenchmarkRenderCounterStore();
  if (!store) {
    return;
  }
  store.stage = stage;
}

export function resetSettingsAllSettingsBenchmarkRenderCounters() {
  const store = getSettingsAllSettingsBenchmarkRenderCounterStore();
  if (!store) {
    return;
  }
  store.commitSequence = 0;
  store.counters = createEmptySettingsAllSettingsBenchmarkRenderCounters();
}

export function recordSettingsAllSettingsBenchmarkRender(
  scope: SettingsAllSettingsBenchmarkRenderCounterScope,
  entityId?: string,
) {
  const store = getSettingsAllSettingsBenchmarkRenderCounterStore();
  if (!store) {
    return;
  }
  const entry = store.counters[scope];
  entry.commitCount += 1;
  if (entityId) {
    entry.entities[entityId] = (entry.entities[entityId] ?? 0) + 1;
  }
  store.commitSequence += 1;
}

export function useSettingsAllSettingsBenchmarkRenderCounter(
  scope: SettingsAllSettingsBenchmarkRenderCounterScope,
  entityId?: string,
) {
  const benchmark = useSettingsAllSettingsBenchmark();

  useEffect(() => {
    if (!benchmark.active) {
      return;
    }
    recordSettingsAllSettingsBenchmarkRender(scope, entityId);
  });
}

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

export function getRequestedSettingsAllSettingsBenchmarkStageFromWindow(): SettingsAllSettingsBenchmarkStage | null {
  if (typeof window === "undefined") {
    return null;
  }
  const params = new URLSearchParams(window.location.search);
  const value = params.get(SETTINGS_ALL_SETTINGS_BENCHMARK_QUERY_PARAM);
  return isSettingsAllSettingsBenchmarkStage(value) ? value : null;
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
    case "full-ui-editor-shell":
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
        renderUiEditorContent: false,
        skipActivationZIndexReorder: false,
        renderSectionBodySnapdomPreview: false,
        sectionBodyHiddenOpacity: null,
      };
    case "full-no-zindex":
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
        renderUiEditorContent: true,
        skipActivationZIndexReorder: true,
        renderSectionBodySnapdomPreview: false,
        sectionBodyHiddenOpacity: null,
      };
    case "full-ui-active-store":
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
        renderUiEditorContent: true,
        skipActivationZIndexReorder: false,
        renderSectionBodySnapdomPreview: false,
        sectionBodyHiddenOpacity: null,
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
        renderSectionBodySemanticPreview: false,
        sectionBodyHiddenOpacity: null,
        keepSectionBodyMountedWithSnapdomPreview: true,
      };
    case "full-section-semantic-preview-hidden-live":
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
        renderSectionBodySemanticPreview: true,
        sectionBodyHiddenOpacity: null,
        keepSectionBodyMountedWithSnapdomPreview: false,
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
    return getRequestedSettingsAllSettingsBenchmarkStageFromWindow();
  }, [location.search]);

  const value = useMemo(
    () =>
      resolveBenchmarkValue(requestedStage, projectName, activeViewModeName),
    [activeViewModeName, projectName, requestedStage],
  );

  useEffect(() => {
    setSettingsAllSettingsBenchmarkRenderCounterStage(
      value.active ? value.stage : "off",
    );
  }, [value.active, value.stage]);

  return (
    <SettingsAllSettingsBenchmarkContext.Provider value={value}>
      {children}
    </SettingsAllSettingsBenchmarkContext.Provider>
  );
}

export function useSettingsAllSettingsBenchmark() {
  return useContext(SettingsAllSettingsBenchmarkContext);
}
