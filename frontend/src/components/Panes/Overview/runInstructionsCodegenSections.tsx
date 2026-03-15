import * as Switch from "@radix-ui/react-switch";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import { usePluginStatusEntries } from "plugins/runtime";
import React from "react";
import { useProjectState } from "state/definitions";
import {
  useAllProjectMetadata,
  useShareSession,
} from "state/stores/sessionStores";
import { useLocalStorage, useSettings } from "state/stores/uiPreferenceStores";
import {
  getPythonCodegenTarget,
  isPluginCodegenTarget,
  projectConfigHasPythonCodegen,
} from "utils/codegenTargets";
import { route_set_project_config_codegen_targets } from "utils/generatedEndpoints";
import {
  createProjectCodegenPluginTarget,
  createProjectCodegenPythonTarget,
  type ProjectCodegenPythonTarget,
  type ProjectCodegenTarget,
} from "utils/generatedTypes";
import type { RunInstructionsAccordionItemValue } from "./runInstructionsAccordionState";
import {
  RUN_SNAPSHOT_MODE_CHOICES,
  RUN_SNAPSHOT_MODE_OPTIONS,
  collectPluginCodegenRegistrations,
  type RunSnapshotModeChoice,
} from "./runInstructionsCodegenModel";
import { RunInstructionsCodegenPolicyContent } from "./runInstructionsCodegenPolicyContent";

const TOGGLE_ROOT_CLASSES =
  "items-center p-[0.2rem] w-7 min-w-7 h-2.5 bg-setta-400 dark:bg-setta-600 rounded-full relative inline-flex cursor-pointer [-webkit-tap-highlight-color:rgba(0,_0,_0,_0)] focus-visible:shadow-black data-[state='checked']:bg-blue-500 dark:data-[state='checked']:bg-blue-700 focus-visible:ring-2 disabled:pointer-events-none";
const TOGGLE_THUMB_CLASSES =
  "block w-2.5 h-2.5 bg-white dark:bg-setta-800 rounded-full transition-all will-change-transform data-[state='checked']:translate-x-4 flex";
const TOGGLE_LABEL_CLASSES = "text-[10px] text-setta-500 dark:text-setta-400";
const PANEL_ROW_CLASSES =
  "mx-[2px] rounded-md bg-setta-100/30 px-2 py-1 text-xs dark:bg-setta-900/40";
const PANEL_SELECT_CLASSES =
  "min-w-0 rounded border border-setta-200 bg-white/70 px-2 py-1 text-[11px] text-setta-700 dark:border-setta-800 dark:bg-setta-950/40 dark:text-setta-200";
const PANEL_ICON_BUTTON_DESTRUCTIVE_CLASSES =
  "inline-flex h-6 w-6 items-center justify-center rounded text-setta-400 hover:bg-red-500/10 hover:text-red-600 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-setta-500 dark:hover:text-red-400";

export type RunInstructionsAccordionItemDescriptor = {
  value: RunInstructionsAccordionItemValue;
  title: string;
  triggerTestId: string;
  content: React.ReactNode;
  disabled?: boolean;
  disabledReason?: string;
};

export function useRunInstructionsCodegenAccordionItems(): RunInstructionsAccordionItemDescriptor[] {
  const isDeploymentMode = useShareSession((state) => state.isDeploymentMode);
  const projectConfig = useProjectState((state) => state.projectConfig);
  const projectConfigId = projectConfig.id;
  const runSnapshotModeOverride = useLocalStorage(
    (state) => state.runSnapshotModeByProjectConfigId[projectConfigId],
  );
  const settingsRunSnapshotMode = useSettings(
    (state) => state.backend.runSnapshotMode,
  );
  const runSnapshotMode = runSnapshotModeOverride ?? settingsRunSnapshotMode;
  const selectedRunSnapshotMode: RunSnapshotModeChoice = runSnapshotModeOverride
    ? runSnapshotModeOverride
    : "default";
  const pluginStatusEntries = usePluginStatusEntries();
  const pythonCodegenEnabled = projectConfigHasPythonCodegen(projectConfig);
  const currentPythonTarget = getPythonCodegenTarget(projectConfig);
  const pluginCodegenTargets = projectConfig.codegenTargets.filter((target) =>
    isPluginCodegenTarget(target),
  );
  const pluginCodegenRegistrations = React.useMemo(
    () => collectPluginCodegenRegistrations(pluginStatusEntries),
    [pluginStatusEntries],
  );
  const pluginCodegenRegistrationByTargetId = React.useMemo(() => {
    const entries = new Map<
      string,
      (typeof pluginCodegenRegistrations)[number]
    >();
    for (const registration of pluginCodegenRegistrations) {
      entries.set(registration.targetId, registration);
    }
    return entries;
  }, [pluginCodegenRegistrations]);
  const orphanedPluginCodegenTargets = React.useMemo(
    () =>
      pluginCodegenTargets
        .filter(
          (target) => !pluginCodegenRegistrationByTargetId.has(target.language),
        )
        .sort((a, b) => a.language.localeCompare(b.language)),
    [pluginCodegenRegistrationByTargetId, pluginCodegenTargets],
  );
  const pythonTarget = React.useMemo(
    () => currentPythonTarget ?? createProjectCodegenPythonTarget(),
    [currentPythonTarget],
  );

  const applyCodegenTargets = React.useCallback(
    (nextTargets: ProjectCodegenTarget[]): void => {
      void route_set_project_config_codegen_targets({
        projectConfigId,
        codegenTargets: nextTargets,
      });
      useAllProjectMetadata.setState((state) => ({
        ...state,
        projectMetadata: state.projectMetadata.map((entry) =>
          entry.id === projectConfigId
            ? { ...entry, codegenTargets: nextTargets }
            : entry,
        ),
      }));
      useProjectState.setState((state) => {
        state.projectConfig.codegenTargets = nextTargets;
      });
    },
    [projectConfigId],
  );

  const updatePythonTarget = React.useCallback(
    (
      updater: (
        target: ProjectCodegenPythonTarget,
      ) => ProjectCodegenPythonTarget,
    ): void => {
      if (isDeploymentMode || !pythonCodegenEnabled) {
        return;
      }
      const nextTarget = updater(pythonTarget);
      const nextTargets = [...pluginCodegenTargets, nextTarget];
      applyCodegenTargets(nextTargets);
    },
    [
      applyCodegenTargets,
      isDeploymentMode,
      pluginCodegenTargets,
      pythonCodegenEnabled,
      pythonTarget,
    ],
  );

  const updateSectionPolicy = React.useCallback(
    (nextPolicy: ProjectCodegenPythonTarget["sectionPolicy"]): void => {
      updatePythonTarget((target) => ({
        ...target,
        sectionPolicy: nextPolicy,
      }));
    },
    [updatePythonTarget],
  );

  const updateCodeObjValuePolicy = React.useCallback(
    (nextPolicy: ProjectCodegenPythonTarget["codeObjValuePolicy"]): void => {
      updatePythonTarget((target) => ({
        ...target,
        codeObjValuePolicy: nextPolicy,
      }));
    },
    [updatePythonTarget],
  );

  const enabledPluginTargetIds = React.useMemo(
    () => new Set(pluginCodegenTargets.map((target) => target.language)),
    [pluginCodegenTargets],
  );

  const togglePluginCodegenTarget = React.useCallback(
    (targetId: string, checked: boolean): void => {
      if (isDeploymentMode) {
        return;
      }
      const alreadyEnabled = enabledPluginTargetIds.has(targetId);
      if (checked === alreadyEnabled) {
        return;
      }
      const nextPluginTargets = checked
        ? [
            ...pluginCodegenTargets,
            createProjectCodegenPluginTarget({
              language: targetId,
              options: {},
            }),
          ]
        : pluginCodegenTargets.filter((target) => target.language !== targetId);
      const nextTargets = pythonCodegenEnabled
        ? [...nextPluginTargets, pythonTarget]
        : nextPluginTargets;
      applyCodegenTargets(nextTargets);
    },
    [
      applyCodegenTargets,
      enabledPluginTargetIds,
      isDeploymentMode,
      pluginCodegenTargets,
      pythonCodegenEnabled,
      pythonTarget,
    ],
  );

  const removeOrphanedPluginCodegenTarget = React.useCallback(
    (targetLanguage: string): void => {
      if (isDeploymentMode) {
        return;
      }
      const nextPluginTargets = pluginCodegenTargets.filter(
        (target) => target.language !== targetLanguage,
      );
      const nextTargets = pythonCodegenEnabled
        ? [...nextPluginTargets, pythonTarget]
        : nextPluginTargets;
      applyCodegenTargets(nextTargets);
    },
    [
      applyCodegenTargets,
      isDeploymentMode,
      pluginCodegenTargets,
      pythonCodegenEnabled,
      pythonTarget,
    ],
  );

  const handleCodegenTargetToggle = React.useCallback(
    (checked: boolean): void => {
      if (isDeploymentMode) {
        return;
      }
      const nextTargets = checked
        ? [
            ...pluginCodegenTargets,
            currentPythonTarget ?? createProjectCodegenPythonTarget(),
          ]
        : pluginCodegenTargets;
      applyCodegenTargets(nextTargets);
    },
    [
      applyCodegenTargets,
      currentPythonTarget,
      isDeploymentMode,
      pluginCodegenTargets,
    ],
  );

  const handleRunSnapshotModeChange = React.useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>): void => {
      const nextValue = event.target.value as RunSnapshotModeChoice;
      if (nextValue === selectedRunSnapshotMode) {
        return;
      }
      if (nextValue === "default") {
        useLocalStorage.setState((state) => {
          const nextOverrides = {
            ...state.runSnapshotModeByProjectConfigId,
          };
          delete nextOverrides[projectConfigId];
          return { runSnapshotModeByProjectConfigId: nextOverrides };
        });
        return;
      }
      useLocalStorage.setState((state) => ({
        runSnapshotModeByProjectConfigId: {
          ...state.runSnapshotModeByProjectConfigId,
          [projectConfigId]: nextValue,
        },
      }));
    },
    [projectConfigId, selectedRunSnapshotMode],
  );

  const runSnapshotModeMeta =
    RUN_SNAPSHOT_MODE_OPTIONS.find(
      (option) => option.value === runSnapshotMode,
    ) ?? RUN_SNAPSHOT_MODE_OPTIONS[0];
  let runSnapshotModePrefix = "Using settings default.";
  if (runSnapshotModeOverride) {
    runSnapshotModePrefix = "Override for this project.";
  }

  const codegenPolicyContent = (
    <RunInstructionsCodegenPolicyContent
      isDeploymentMode={isDeploymentMode}
      pythonCodegenEnabled={pythonCodegenEnabled}
      pythonTarget={pythonTarget}
      updatePythonTarget={updatePythonTarget}
      updateSectionPolicy={updateSectionPolicy}
      updateCodeObjValuePolicy={updateCodeObjValuePolicy}
    />
  );

  const accordionItems: RunInstructionsAccordionItemDescriptor[] = [];
  if (!isDeploymentMode) {
    accordionItems.push(
      {
        value: "run-instructions-run-snapshot-mode",
        title: "Run Snapshot Mode",
        triggerTestId: "run-instructions-accordion-run-snapshot-mode",
        content: (
          <div className={`${PANEL_ROW_CLASSES} flex min-w-0 flex-col gap-2`}>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] text-setta-600 dark:text-setta-300">
                {runSnapshotModeMeta.description}
              </div>
              <div className="text-[11px] text-setta-400 dark:text-setta-500">
                {runSnapshotModePrefix}
              </div>
            </div>
            <select
              className={`${PANEL_SELECT_CLASSES} w-full`}
              value={selectedRunSnapshotMode}
              onChange={handleRunSnapshotModeChange}
              {...getFloatingBoxHandlers({
                content: "Run snapshot mode",
              })}
            >
              {RUN_SNAPSHOT_MODE_CHOICES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ),
      },
      {
        value: "run-instructions-codegen-targets",
        title: "Codegen Targets",
        triggerTestId: "run-instructions-accordion-codegen-targets",
        content: (
          <div className={`${PANEL_ROW_CLASSES} flex min-w-0 flex-col gap-2`}>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-[11px] text-setta-600 dark:text-setta-300">
                  Enable generated code sections for this project.
                </div>
              </div>
              <div
                className="ml-auto flex items-center gap-1"
                data-setting-anchor="core.run_instructions.python_codegen_enabled"
              >
                <span className={TOGGLE_LABEL_CLASSES}>Python</span>
                <Switch.Root
                  className={TOGGLE_ROOT_CLASSES}
                  checked={pythonCodegenEnabled}
                  disabled={isDeploymentMode}
                  onCheckedChange={handleCodegenTargetToggle}
                >
                  <Switch.Thumb className={TOGGLE_THUMB_CLASSES} />
                </Switch.Root>
              </div>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              {pluginCodegenRegistrations.length === 0 &&
              orphanedPluginCodegenTargets.length === 0 ? (
                <div className="text-[11px] text-setta-500 dark:text-setta-400">
                  No plugin codegen targets registered.
                </div>
              ) : null}
              {pluginCodegenRegistrations.map((registration) => (
                <div
                  key={registration.targetId}
                  className="flex min-w-0 flex-wrap items-center gap-2 rounded bg-white/45 px-2 py-1 dark:bg-setta-950/35"
                >
                  <div className="min-w-0 flex-1 text-[11px] text-setta-700 dark:text-setta-200">
                    {registration.name} ({registration.language})
                    <span className="ml-1 text-[10px] text-setta-500 dark:text-setta-400">
                      {registration.targetId}
                    </span>
                  </div>
                  <div className="ml-auto flex items-center gap-1">
                    <span className={TOGGLE_LABEL_CLASSES}>Enabled</span>
                    <Switch.Root
                      className={TOGGLE_ROOT_CLASSES}
                      checked={enabledPluginTargetIds.has(
                        registration.targetId,
                      )}
                      disabled={isDeploymentMode}
                      onCheckedChange={(checked) =>
                        togglePluginCodegenTarget(
                          registration.targetId,
                          checked,
                        )
                      }
                    >
                      <Switch.Thumb className={TOGGLE_THUMB_CLASSES} />
                    </Switch.Root>
                  </div>
                </div>
              ))}
              {orphanedPluginCodegenTargets.length > 0 ? (
                <div className="mt-1 space-y-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                    Orphaned configured targets
                  </div>
                  {orphanedPluginCodegenTargets.map((target) => (
                    <div
                      key={`orphaned-${target.language}`}
                      data-testid={`orphaned-codegen-target-${target.language}`}
                      className="flex min-w-0 flex-wrap items-center gap-2 rounded border border-amber-300/70 bg-amber-50/80 px-2 py-1 dark:border-amber-700/60 dark:bg-amber-950/30"
                    >
                      <div className="min-w-0 flex-1 text-[11px] text-amber-800 dark:text-amber-200">
                        {target.language}
                      </div>
                      <button
                        data-testid={`remove-orphaned-codegen-target-${target.language}`}
                        className={PANEL_ICON_BUTTON_DESTRUCTIVE_CLASSES}
                        onClick={() =>
                          removeOrphanedPluginCodegenTarget(target.language)
                        }
                        type="button"
                        {...getFloatingBoxHandlers({
                          content: "Remove stale codegen target",
                        })}
                      >
                        <i className="gg-trash" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ),
      },
    );
  }
  accordionItems.push({
    value: "run-instructions-codegen-policy",
    title: "Codegen Policy",
    triggerTestId: "run-instructions-accordion-codegen-policy",
    content: codegenPolicyContent,
  });
  return accordionItems;
}
