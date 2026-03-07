import * as Switch from "@radix-ui/react-switch";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import _ from "lodash";
import { usePluginStatusEntries } from "plugins/runtime";
import React from "react";
import { RiLoopRightFill, RiPlayMiniFill } from "react-icons/ri";
import {
  addOrGetCustomRunForCodeBlock,
  deleteCustomRun,
  ensureDefaultCustomRuns,
  runCustomRun,
  setCustomRunMode,
  toggleCustomRunInDropdown,
} from "state/actions/customRuns";
import { applyProjectCodegenTargetsResponse } from "state/actions/project/codegenTargets";
import {
  getActiveViewModeConfig,
  getCurrEffectiveCodeObjImpl,
  getCurrEffectiveSectionImpl,
  getSectionCore,
  getSectionShouldRender,
} from "state/actions/sectionInfos";
import {
  CustomRunItem,
  useLocalStorage,
  useProjectState,
  useRunControl,
  useSettings,
  useShareSession,
  ZustandProjectState,
} from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import {
  getPythonCodegenTarget,
  isPluginCodegenTarget,
  projectConfigHasPythonCodegen,
} from "utils/codegenTargets";
import { res200 } from "utils/endpointUtils";
import { route_set_project_config_codegen_targets } from "utils/generatedEndpoints";
import {
  CodeObjTypeEnum,
  CodeObjValueRepresentationModeEnum,
  createCodeObjValuePolicy,
  createProjectCodegenPluginTarget,
  createProjectCodegenPythonTarget,
  createSectionCodegenPolicy,
  isBaseParentSectionImpl,
  isBaseSectionWithParamsImpl,
  SectionTypeEnum,
  type BaseSectionImplUnion,
  type CodeObjType,
  type CodeObjValueRepresentationMode,
  type Core,
  type PluginStatusEntry,
  type ProjectCodegenPythonTarget,
  type ProjectCodegenTarget,
  type SectionType,
  type SettingsState,
  type ViewModeConfig,
} from "utils/generatedTypes";
import { RunInstructionsAccordion } from "./RunInstructionsAccordion";
import {
  normalizeRunInstructionsAccordionOpenValues,
  RUN_INSTRUCTIONS_ACCORDION_DEFAULT_OPEN_VALUES,
  type RunInstructionsAccordionItemValue,
} from "./runInstructionsAccordionState";
import { isRunnableSectionForCustomRun } from "./runInstructionsRunnableCodeBlocks";

type RunnableCodeBlock = { sectionId: string; name: string; depth: number };
type RunSnapshotMode = SettingsState["backend"]["runSnapshotMode"];
type RunSnapshotModeChoice = RunSnapshotMode | "default";
type SectionCodegenMode = "inherit" | "include" | "exclude";
type SectionRepresentationMode = "expression" | "file_path" | "file_read";
type SectionOption = { id: string; name: string; type: SectionType };
type CodeObjOption = {
  id: string;
  name: string;
  type: CodeObjType;
  sectionName: string;
  label: string;
};
type PluginCodegenRegistration = {
  targetId: string;
  language: string;
  name: string;
};

const TOGGLE_ROOT_CLASSES =
  "items-center p-[0.2rem] w-7 min-w-7 h-2.5 bg-setta-400 dark:bg-setta-600 rounded-full relative inline-flex cursor-pointer [-webkit-tap-highlight-color:rgba(0,_0,_0,_0)] focus-visible:shadow-black data-[state='checked']:bg-blue-500 dark:data-[state='checked']:bg-blue-700 focus-visible:ring-2 disabled:pointer-events-none";
const TOGGLE_THUMB_CLASSES =
  "block w-2.5 h-2.5 bg-white dark:bg-setta-800 rounded-full transition-all will-change-transform data-[state='checked']:translate-x-4 flex";
const TOGGLE_LABEL_CLASSES = "text-[10px] text-setta-500 dark:text-setta-400";
const PANEL_CARD_CLASSES =
  "mx-[2px] rounded-md bg-setta-100/30 p-2 text-xs dark:bg-setta-900/40";
const PANEL_ROW_CLASSES =
  "mx-[2px] rounded-md bg-setta-100/30 px-2 py-1 text-xs dark:bg-setta-900/40";
const PANEL_SELECT_CLASSES =
  "min-w-0 rounded border border-setta-200 bg-white/70 px-2 py-1 text-[11px] text-setta-700 dark:border-setta-800 dark:bg-setta-950/40 dark:text-setta-200";
const PANEL_COMPACT_SELECT_CLASSES =
  "min-w-0 rounded border border-setta-200 bg-white/70 px-1.5 py-0.5 text-[11px] text-setta-700 disabled:opacity-60 dark:border-setta-800 dark:bg-setta-950/40 dark:text-setta-200";
const PANEL_ICON_BUTTON_CLASSES =
  "inline-flex h-6 w-6 items-center justify-center rounded text-setta-600 hover:bg-setta-200/40 hover:text-setta-900 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40 dark:text-setta-300 dark:hover:bg-setta-800/40 dark:hover:text-setta-100";
const PANEL_ICON_BUTTON_DESTRUCTIVE_CLASSES =
  "inline-flex h-6 w-6 items-center justify-center rounded text-setta-400 hover:bg-red-500/10 hover:text-red-600 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-setta-500 dark:hover:text-red-400";
const RUN_INSTRUCTIONS_INLINE_INSET_CLASS = "pl-[0.375rem] pr-[0.75rem]";
const CUSTOM_RUN_ROW_CLASSES =
  "mx-[2px] flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 rounded-md bg-setta-100/30 px-2 py-0.5 text-xs dark:bg-setta-900/40";
const CUSTOM_RUN_EMPTY_STATE_CLASSES =
  "mx-[2px] rounded-md bg-setta-100/30 px-2 py-1 text-xs text-setta-600 dark:bg-setta-900/40 dark:text-setta-300";
const CODEGEN_SECTION_TYPES: SectionType[] = [
  SectionTypeEnum.Callable,
  SectionTypeEnum.Dict,
  SectionTypeEnum.ListRoot,
  SectionTypeEnum.Group,
  SectionTypeEnum.GlobalVariables,
  SectionTypeEnum.TextBlock,
  SectionTypeEnum.Draw,
  SectionTypeEnum.Image,
  SectionTypeEnum.MetaControl,
  SectionTypeEnum.Chat,
];
const META_CONTROL_CODE_OBJ_TYPES: CodeObjType[] = [
  CodeObjTypeEnum.DropdownParam,
  CodeObjTypeEnum.SliderParam,
  CodeObjTypeEnum.RotaryParam,
  CodeObjTypeEnum.SwitchParam,
  CodeObjTypeEnum.TextParam,
  CodeObjTypeEnum.DateParam,
  CodeObjTypeEnum.TimeParam,
  CodeObjTypeEnum.TextAreaParam,
  CodeObjTypeEnum.CodeParam,
  CodeObjTypeEnum.PasswordParam,
  CodeObjTypeEnum.ColorPickerParam,
  CodeObjTypeEnum.ButtonParam,
  CodeObjTypeEnum.DropzoneParam,
];
type MetaControlCodeObjType = (typeof META_CONTROL_CODE_OBJ_TYPES)[number];
const META_CONTROL_CODE_OBJ_LABELS: Record<MetaControlCodeObjType, string> = {
  [CodeObjTypeEnum.DropdownParam]: "Dropdown",
  [CodeObjTypeEnum.SliderParam]: "Slider",
  [CodeObjTypeEnum.RotaryParam]: "Rotary",
  [CodeObjTypeEnum.SwitchParam]: "Switch",
  [CodeObjTypeEnum.TextParam]: "Text Input",
  [CodeObjTypeEnum.DateParam]: "Date Input",
  [CodeObjTypeEnum.TimeParam]: "Time Input",
  [CodeObjTypeEnum.TextAreaParam]: "Text Area",
  [CodeObjTypeEnum.CodeParam]: "Code Input",
  [CodeObjTypeEnum.PasswordParam]: "Password Field",
  [CodeObjTypeEnum.ColorPickerParam]: "Color Picker",
  [CodeObjTypeEnum.ButtonParam]: "Button",
  [CodeObjTypeEnum.DropzoneParam]: "Dropzone",
};
const CODEGEN_CODE_OBJ_TYPES: CodeObjType[] = [
  CodeObjTypeEnum.CodeParam,
  CodeObjTypeEnum.TextParam,
  CodeObjTypeEnum.DateParam,
  CodeObjTypeEnum.TimeParam,
  CodeObjTypeEnum.ButtonParam,
  CodeObjTypeEnum.SliderParam,
  CodeObjTypeEnum.RotaryParam,
  CodeObjTypeEnum.SwitchParam,
  CodeObjTypeEnum.ColorPickerParam,
  CodeObjTypeEnum.DropdownParam,
  CodeObjTypeEnum.PasswordParam,
  CodeObjTypeEnum.TextAreaParam,
  CodeObjTypeEnum.DropzoneParam,
  CodeObjTypeEnum.NestedParam,
];
const SECTION_CODEGEN_MODE_OPTIONS: Array<{
  value: SectionCodegenMode;
  label: string;
}> = [
  { value: "inherit", label: "inherit" },
  { value: "include", label: "include" },
  { value: "exclude", label: "exclude" },
];

const RUN_SNAPSHOT_MODE_OPTIONS: Array<{
  value: RunSnapshotMode;
  label: string;
  description: string;
}> = [
  {
    value: "ephemeral",
    label: "Ephemeral",
    description: "Snapshot per run, cleaned up automatically.",
  },
  {
    value: "always",
    label: "Always",
    description: "Snapshot per run, stored under code history.",
  },
  {
    value: "never",
    label: "Never",
    description: "Run from canonical files without a snapshot.",
  },
];
const RUN_SNAPSHOT_MODE_CHOICES: Array<{
  value: RunSnapshotModeChoice;
  label: string;
  description: string;
}> = [
  {
    value: "default",
    label: "Use Settings",
    description: "Follow the settings default for this project.",
  },
  ...RUN_SNAPSHOT_MODE_OPTIONS,
];

export function RunInstructions() {
  const { canRun } = useShareCapabilities();
  const isDeploymentMode = useShareSession((x) => x.isDeploymentMode);
  const projectConfig = useProjectState((x) => x.projectConfig);
  const projectConfigId = projectConfig.id;
  const runSnapshotModeOverride = useLocalStorage(
    (x) => x.runSnapshotModeByProjectConfigId[projectConfigId],
  );
  const settingsRunSnapshotMode = useSettings((x) => x.backend.runSnapshotMode);
  const runSnapshotMode = runSnapshotModeOverride ?? settingsRunSnapshotMode;
  const selectedRunSnapshotMode: RunSnapshotModeChoice = runSnapshotModeOverride
    ? runSnapshotModeOverride
    : "default";
  const customRuns = useLocalStorage(
    (x) => x.customRunsByProjectConfigId[projectConfigId] ?? [],
  );
  const pluginStatusEntries = usePluginStatusEntries();
  const storedAccordionOpenValues = useLocalStorage(
    (x) =>
      x.runInstructionsAccordionOpenValuesByProjectConfigId[projectConfigId] ??
      null,
  );
  const { runMode, continuousRunStarted, continuousRunCustomRunId } =
    useRunControl((x) => ({
      runMode: x.runMode,
      continuousRunStarted: x.continuousRunStarted,
      continuousRunCustomRunId: x.continuousRunCustomRunId,
    }));
  const runnableCodeBlocks = useRunnableCodeBlockListing();
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
    const entries = new Map<string, PluginCodegenRegistration>();
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
  const defaultSectionPolicy = React.useMemo(
    () => createSectionCodegenPolicy(),
    [],
  );
  const defaultCodeObjValuePolicy = React.useMemo(
    () => createCodeObjValuePolicy(),
    [],
  );
  const pythonTarget = React.useMemo(
    () => currentPythonTarget ?? createProjectCodegenPythonTarget(),
    [currentPythonTarget],
  );
  const sectionPolicy = pythonTarget.sectionPolicy;
  const codeObjValuePolicy = pythonTarget.codeObjValuePolicy;
  const defaultAllowlist = defaultSectionPolicy.allowlist ?? [];
  const defaultMetaControlAllowlist =
    defaultSectionPolicy.metaControlAllowlist ?? META_CONTROL_CODE_OBJ_TYPES;
  const [cachedAllowlist, setCachedAllowlist] = React.useState<SectionType[]>(
    sectionPolicy.allowlist ?? defaultAllowlist,
  );
  const [pendingOverrideId, setPendingOverrideId] = React.useState("");
  const [pendingCodeObjOverrideId, setPendingCodeObjOverrideId] =
    React.useState("");
  const sectionOptions = useSectionOptions();
  const codeObjOptions = useCodeObjOptions();
  const sectionOptionsById = React.useMemo(() => {
    const entries = new Map<string, SectionOption>();
    for (const option of sectionOptions) {
      entries.set(option.id, option);
    }
    return entries;
  }, [sectionOptions]);
  const codeObjOptionsById = React.useMemo(() => {
    const entries = new Map<string, CodeObjOption>();
    for (const option of codeObjOptions) {
      entries.set(option.id, option);
    }
    return entries;
  }, [codeObjOptions]);

  React.useEffect(() => {
    if (!sectionPolicy.allowlist) {
      return;
    }
    setCachedAllowlist((prev) =>
      _.isEqual(prev, sectionPolicy.allowlist) ? prev : sectionPolicy.allowlist,
    );
  }, [sectionPolicy.allowlist]);

  const applyCodegenTargets = (nextTargets: ProjectCodegenTarget[]): void => {
    void route_set_project_config_codegen_targets({
      projectConfigId,
      codegenTargets: nextTargets,
    }).then((response) => {
      if (!res200(response) || !response.data) {
        return;
      }
      applyProjectCodegenTargetsResponse(response.data);
    });
  };

  const handleCodegenTargetToggle = (checked: boolean): void => {
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
  };

  const updatePythonTarget = (
    updater: (target: ProjectCodegenPythonTarget) => ProjectCodegenPythonTarget,
  ): void => {
    if (isDeploymentMode || !pythonCodegenEnabled) {
      return;
    }
    const nextTarget = updater(pythonTarget);
    const nextTargets = [...pluginCodegenTargets, nextTarget];
    applyCodegenTargets(nextTargets);
  };

  const updateSectionPolicy = (
    nextPolicy: ProjectCodegenPythonTarget["sectionPolicy"],
  ): void => {
    updatePythonTarget((target) => ({
      ...target,
      sectionPolicy: nextPolicy,
    }));
  };

  const updateCodeObjValuePolicy = (
    nextPolicy: ProjectCodegenPythonTarget["codeObjValuePolicy"],
  ): void => {
    updatePythonTarget((target) => ({
      ...target,
      codeObjValuePolicy: nextPolicy,
    }));
  };
  const enabledPluginTargetIds = React.useMemo(
    () => new Set(pluginCodegenTargets.map((target) => target.language)),
    [pluginCodegenTargets],
  );

  const togglePluginCodegenTarget = (
    registration: PluginCodegenRegistration,
    checked: boolean,
  ): void => {
    if (isDeploymentMode) {
      return;
    }
    const alreadyEnabled = enabledPluginTargetIds.has(registration.targetId);
    if (checked === alreadyEnabled) {
      return;
    }
    const nextPluginTargets = checked
      ? [
          ...pluginCodegenTargets,
          createProjectCodegenPluginTarget({
            language: registration.targetId,
            options: {},
          }),
        ]
      : pluginCodegenTargets.filter(
          (target) => target.language !== registration.targetId,
        );
    const nextTargets = pythonCodegenEnabled
      ? [...nextPluginTargets, pythonTarget]
      : nextPluginTargets;
    applyCodegenTargets(nextTargets);
  };

  const removeOrphanedPluginCodegenTarget = (targetLanguage: string): void => {
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
  };

  React.useEffect(() => {
    if (!canRun) {
      return;
    }
    ensureDefaultCustomRuns(projectConfigId);
  }, [projectConfigId, canRun]);

  const runSnapshotModeMeta =
    RUN_SNAPSHOT_MODE_OPTIONS.find(
      (option) => option.value === runSnapshotMode,
    ) ?? RUN_SNAPSHOT_MODE_OPTIONS[0];
  let runSnapshotModePrefix = "Using settings default.";
  if (runSnapshotModeOverride) {
    runSnapshotModePrefix = "Override for this project.";
  }

  const handleRunSnapshotModeChange = (
    event: React.ChangeEvent<HTMLSelectElement>,
  ): void => {
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
  };

  const allowlistEnabled = sectionPolicy.allowlist !== null;
  const allowlist = sectionPolicy.allowlist ?? cachedAllowlist;
  const metaControlAllowlist =
    sectionPolicy.metaControlAllowlist ?? defaultMetaControlAllowlist;
  const availableOverrideSections = sectionOptions
    .filter((option) => !sectionPolicy.sectionOverrides[option.id])
    .sort((a, b) => a.name.localeCompare(b.name));
  const overrideEntries = Object.entries(sectionPolicy.sectionOverrides)
    .map(([sectionId, override]) => {
      const section = sectionOptionsById.get(sectionId) ?? null;
      return {
        sectionId,
        override,
        name: section?.name ?? sectionId,
        type: section?.type ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const availableCodeObjOverrides = codeObjOptions
    .filter((option) => !codeObjValuePolicy.codeObjOverrides[option.id])
    .sort((a, b) => a.label.localeCompare(b.label));
  const codeObjOverrideEntries = Object.entries(
    codeObjValuePolicy.codeObjOverrides,
  )
    .map(([codeObjId, override]) => {
      const codeObj = codeObjOptionsById.get(codeObjId) ?? null;
      return {
        codeObjId,
        override,
        label: codeObj?.label ?? codeObjId,
        type: codeObj?.type ?? null,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  React.useEffect(() => {
    if (!pendingOverrideId) {
      return;
    }
    const stillAvailable = availableOverrideSections.some(
      (option) => option.id === pendingOverrideId,
    );
    if (!stillAvailable) {
      setPendingOverrideId("");
    }
  }, [availableOverrideSections, pendingOverrideId]);

  React.useEffect(() => {
    if (!pendingCodeObjOverrideId) {
      return;
    }
    const stillAvailable = availableCodeObjOverrides.some(
      (option) => option.id === pendingCodeObjOverrideId,
    );
    if (!stillAvailable) {
      setPendingCodeObjOverrideId("");
    }
  }, [availableCodeObjOverrides, pendingCodeObjOverrideId]);

  const resolvedAccordionOpenValues = React.useMemo(
    () =>
      normalizeRunInstructionsAccordionOpenValues(
        storedAccordionOpenValues ??
          RUN_INSTRUCTIONS_ACCORDION_DEFAULT_OPEN_VALUES,
      ),
    [storedAccordionOpenValues],
  );
  const setAccordionOpenValues = React.useCallback(
    (nextOpenValues: Array<string>) => {
      useLocalStorage.setState((state) => ({
        runInstructionsAccordionOpenValuesByProjectConfigId: {
          ...state.runInstructionsAccordionOpenValuesByProjectConfigId,
          [projectConfigId]:
            normalizeRunInstructionsAccordionOpenValues(nextOpenValues),
        },
      }));
    },
    [projectConfigId],
  );

  if (!canRun) {
    return (
      <div className={RUN_INSTRUCTIONS_INLINE_INSET_CLASS}>
        <div className="rounded border border-dashed border-setta-200 bg-white/40 p-3 text-xs text-setta-600 dark:border-setta-800 dark:bg-setta-900/40 dark:text-setta-300">
          Run controls are disabled in sharing mode.
        </div>
      </div>
    );
  }

  const codegenPolicyContent = !pythonCodegenEnabled ? (
    <div
      className="mx-[2px] rounded border border-dashed border-setta-200 bg-white/40 p-2 text-[11px] text-setta-600 dark:border-setta-800 dark:bg-setta-900/40 dark:text-setta-300"
      data-testid="run-instructions-codegen-policy-disabled-message"
    >
      Enable Python codegen to edit section policy settings.
    </div>
  ) : (
    <div className="space-y-2">
      <div
        className={`${PANEL_ROW_CLASSES} flex min-w-0 flex-wrap items-center gap-2`}
      >
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold uppercase tracking-tight text-setta-400 dark:text-setta-500">
            Generated Metadata
          </div>
          <div className="text-[11px] text-setta-600 dark:text-setta-300">
            Attach project and section metadata to state.__state__.
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <span className={TOGGLE_LABEL_CLASSES}>Meta</span>
          <Switch.Root
            className={TOGGLE_ROOT_CLASSES}
            checked={pythonTarget.generateMetadata}
            data-testid="run-instructions-python-metadata-toggle"
            disabled={isDeploymentMode}
            onCheckedChange={(checked) =>
              updatePythonTarget((target) => ({
                ...target,
                generateMetadata: checked,
              }))
            }
          >
            <Switch.Thumb className={TOGGLE_THUMB_CLASSES} />
          </Switch.Root>
        </div>
      </div>

      <div className={PANEL_CARD_CLASSES}>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold uppercase tracking-tight text-setta-400 dark:text-setta-500">
              Section Allowlist
            </div>
            <div className="text-[11px] text-setta-600 dark:text-setta-300">
              Choose which section types emit code by default.
            </div>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <span className={TOGGLE_LABEL_CLASSES}>Allowlist</span>
            <Switch.Root
              className={TOGGLE_ROOT_CLASSES}
              checked={allowlistEnabled}
              disabled={isDeploymentMode}
              onCheckedChange={(checked) => {
                const nextAllowlist = checked ? allowlist : null;
                updateSectionPolicy({
                  ...sectionPolicy,
                  allowlist: nextAllowlist,
                });
              }}
            >
              <Switch.Thumb className={TOGGLE_THUMB_CLASSES} />
            </Switch.Root>
          </div>
        </div>
        {allowlistEnabled ? (
          <div className="mt-2 grid grid-cols-1 gap-y-1">
            {CODEGEN_SECTION_TYPES.map((sectionType) => {
              const isChecked = allowlist.includes(sectionType);
              if (sectionType !== SectionTypeEnum.MetaControl) {
                return (
                  <label
                    key={sectionType}
                    className="flex items-center gap-2 text-[11px] text-setta-600 dark:text-setta-300"
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={isDeploymentMode}
                      onChange={(event) => {
                        const nextAllowlist = event.target.checked
                          ? Array.from(new Set([...allowlist, sectionType]))
                          : allowlist.filter((item) => item !== sectionType);
                        updateSectionPolicy({
                          ...sectionPolicy,
                          allowlist: nextAllowlist,
                        });
                      }}
                      className="h-4 w-4 rounded-md bg-setta-500/10 checked:bg-blue-500 hover:bg-setta-500/30 hover:checked:bg-blue-500"
                    />
                    <span>{sectionType}</span>
                  </label>
                );
              }

              return (
                <div key={sectionType} className="flex flex-col gap-1">
                  <label className="flex items-center gap-2 text-[11px] text-setta-600 dark:text-setta-300">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={isDeploymentMode}
                      onChange={(event) => {
                        const nextAllowlist = event.target.checked
                          ? Array.from(new Set([...allowlist, sectionType]))
                          : allowlist.filter((item) => item !== sectionType);
                        updateSectionPolicy({
                          ...sectionPolicy,
                          allowlist: nextAllowlist,
                        });
                      }}
                      className="h-4 w-4 rounded-md bg-setta-500/10 checked:bg-blue-500 hover:bg-setta-500/30 hover:checked:bg-blue-500"
                    />
                    <span>{sectionType}</span>
                  </label>
                  {isChecked ? (
                    <div className="ml-6 grid grid-cols-1 gap-y-1">
                      {META_CONTROL_CODE_OBJ_TYPES.map((codeObjType) => {
                        const isTypeChecked =
                          metaControlAllowlist.includes(codeObjType);
                        const label = META_CONTROL_CODE_OBJ_LABELS[codeObjType];
                        return (
                          <label
                            key={codeObjType}
                            className="flex items-center gap-2 text-[11px] text-setta-500 dark:text-setta-400"
                          >
                            <input
                              type="checkbox"
                              checked={isTypeChecked}
                              disabled={isDeploymentMode}
                              onChange={(event) => {
                                let nextMetaControlAllowlist =
                                  metaControlAllowlist;
                                if (event.target.checked) {
                                  nextMetaControlAllowlist = Array.from(
                                    new Set([
                                      ...metaControlAllowlist,
                                      codeObjType,
                                    ]),
                                  );
                                } else {
                                  nextMetaControlAllowlist =
                                    metaControlAllowlist.filter(
                                      (item) => item !== codeObjType,
                                    );
                                }
                                updateSectionPolicy({
                                  ...sectionPolicy,
                                  metaControlAllowlist:
                                    nextMetaControlAllowlist,
                                });
                              }}
                              className="h-4 w-4 rounded-md bg-setta-500/10 checked:bg-blue-500 hover:bg-setta-500/30 hover:checked:bg-blue-500"
                            />
                            <span>{label}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-2 text-[11px] text-setta-500 dark:text-setta-400">
            All supported section types are included.
          </div>
        )}
      </div>

      <div className={PANEL_CARD_CLASSES}>
        <div className="text-[11px] font-bold uppercase tracking-tight text-setta-400 dark:text-setta-500">
          Section Type Defaults
        </div>
        <div className="mt-1 space-y-1">
          {CODEGEN_SECTION_TYPES.map((sectionType) => {
            const typePolicy = sectionPolicy.typePolicies[sectionType];
            const isMetaControl = sectionType === SectionTypeEnum.MetaControl;
            const representationOptions = isMetaControl
              ? []
              : getRepresentationOptions(sectionType);
            const representationOptionsWithFallback =
              representationOptions.includes(typePolicy.representation)
                ? representationOptions
                : [typePolicy.representation, ...representationOptions];
            const representationDisabled =
              representationOptionsWithFallback.length === 1;
            return (
              <div
                key={sectionType}
                className="flex flex-wrap items-center gap-2 rounded-md bg-white/45 px-2 py-1 dark:bg-setta-950/35"
              >
                <div className="min-w-0 basis-full truncate text-[11px] text-setta-700 dark:text-setta-200">
                  {sectionType}
                </div>
                <select
                  className={`${PANEL_COMPACT_SELECT_CLASSES} flex-1 basis-20`}
                  disabled={isDeploymentMode}
                  value={typePolicy.mode}
                  onChange={(event) => {
                    const nextMode = event.target.value as SectionCodegenMode;
                    updateSectionPolicy({
                      ...sectionPolicy,
                      typePolicies: {
                        ...sectionPolicy.typePolicies,
                        [sectionType]: {
                          ...typePolicy,
                          mode: nextMode,
                        },
                      },
                    });
                  }}
                >
                  {SECTION_CODEGEN_MODE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {isMetaControl ? (
                  <div className="min-w-0 flex-1 basis-24 text-right text-[11px] text-setta-500 dark:text-setta-400">
                    code obj policy
                  </div>
                ) : (
                  <select
                    className={`${PANEL_COMPACT_SELECT_CLASSES} flex-1 basis-24`}
                    disabled={isDeploymentMode || representationDisabled}
                    value={typePolicy.representation}
                    onChange={(event) => {
                      const nextRepresentation = event.target
                        .value as SectionRepresentationMode;
                      updateSectionPolicy({
                        ...sectionPolicy,
                        typePolicies: {
                          ...sectionPolicy.typePolicies,
                          [sectionType]: {
                            ...typePolicy,
                            representation: nextRepresentation,
                          },
                        },
                      });
                    }}
                  >
                    {representationOptionsWithFallback.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className={PANEL_CARD_CLASSES}>
        <div className="text-[11px] font-bold uppercase tracking-tight text-setta-400 dark:text-setta-500">
          Section Overrides
        </div>
        <div className="mt-1 text-[11px] text-setta-600 dark:text-setta-300">
          Include or exclude individual sections and set their representation.
        </div>
        <div className="mt-2 flex min-w-0 flex-col gap-1.5">
          <select
            className={`${PANEL_SELECT_CLASSES} w-full`}
            disabled={
              isDeploymentMode || availableOverrideSections.length === 0
            }
            value={pendingOverrideId}
            onChange={(event) => {
              setPendingOverrideId(event.target.value);
            }}
          >
            <option value="">Select a section</option>
            {availableOverrideSections.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
          <div className="flex justify-end">
            <button
              className={PANEL_ICON_BUTTON_CLASSES}
              disabled={isDeploymentMode || !pendingOverrideId}
              onClick={() => {
                const selected =
                  sectionOptionsById.get(pendingOverrideId) ?? null;
                if (!selected) {
                  return;
                }
                const basePolicy = sectionPolicy.typePolicies[selected.type];
                const nextOverrides = {
                  ...sectionPolicy.sectionOverrides,
                  [pendingOverrideId]: {
                    mode: "inherit",
                    representation: basePolicy?.representation ?? "expression",
                  },
                };
                updateSectionPolicy({
                  ...sectionPolicy,
                  sectionOverrides: nextOverrides,
                });
                setPendingOverrideId("");
              }}
              type="button"
              {...getFloatingBoxHandlers({ content: "Add override" })}
            >
              <i className="gg-add" />
            </button>
          </div>
        </div>
        {overrideEntries.length === 0 ? (
          <div className="mt-2 text-[11px] text-setta-500 dark:text-setta-400">
            No overrides yet.
          </div>
        ) : (
          <div className="mt-2 space-y-1">
            {overrideEntries.map((entry) => {
              const isMetaControl = entry.type === SectionTypeEnum.MetaControl;
              const representationOptions = isMetaControl
                ? []
                : getRepresentationOptions(entry.type);
              const overrideRepresentationOptions =
                representationOptions.includes(entry.override.representation)
                  ? representationOptions
                  : [entry.override.representation];
              const representationDisabled =
                overrideRepresentationOptions.length === 1;
              return (
                <div
                  key={entry.sectionId}
                  className="flex flex-wrap items-center gap-2 rounded-md bg-white/45 px-2 py-1 dark:bg-setta-950/35"
                >
                  <div className="min-w-0 basis-full truncate text-[11px] text-setta-700 dark:text-setta-200">
                    {entry.name}
                  </div>
                  <select
                    className={`${PANEL_COMPACT_SELECT_CLASSES} flex-1 basis-20`}
                    disabled={isDeploymentMode}
                    value={entry.override.mode}
                    onChange={(event) => {
                      const nextMode = event.target.value as SectionCodegenMode;
                      updateSectionPolicy({
                        ...sectionPolicy,
                        sectionOverrides: {
                          ...sectionPolicy.sectionOverrides,
                          [entry.sectionId]: {
                            ...entry.override,
                            mode: nextMode,
                          },
                        },
                      });
                    }}
                  >
                    {SECTION_CODEGEN_MODE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {isMetaControl ? (
                    <div className="min-w-0 flex-1 basis-24 text-right text-[11px] text-setta-500 dark:text-setta-400">
                      code obj policy
                    </div>
                  ) : (
                    <select
                      className={`${PANEL_COMPACT_SELECT_CLASSES} flex-1 basis-24`}
                      disabled={isDeploymentMode || representationDisabled}
                      value={entry.override.representation}
                      onChange={(event) => {
                        const nextRepresentation = event.target
                          .value as SectionRepresentationMode;
                        updateSectionPolicy({
                          ...sectionPolicy,
                          sectionOverrides: {
                            ...sectionPolicy.sectionOverrides,
                            [entry.sectionId]: {
                              ...entry.override,
                              representation: nextRepresentation,
                            },
                          },
                        });
                      }}
                    >
                      {overrideRepresentationOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    className={PANEL_ICON_BUTTON_DESTRUCTIVE_CLASSES}
                    disabled={isDeploymentMode}
                    onClick={() => {
                      const nextOverrides = {
                        ...sectionPolicy.sectionOverrides,
                      };
                      delete nextOverrides[entry.sectionId];
                      updateSectionPolicy({
                        ...sectionPolicy,
                        sectionOverrides: nextOverrides,
                      });
                    }}
                    type="button"
                    {...getFloatingBoxHandlers({
                      content: "Remove override",
                    })}
                  >
                    <i className="gg-trash" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className={PANEL_CARD_CLASSES}>
        <div className="text-[11px] font-bold uppercase tracking-tight text-setta-400 dark:text-setta-500">
          Code Obj Type Defaults
        </div>
        <div className="mt-1 text-[11px] text-setta-600 dark:text-setta-300">
          Choose how param values are formatted by default.
        </div>
        <div className="mt-1 space-y-1">
          {CODEGEN_CODE_OBJ_TYPES.map((codeObjType) => {
            const typePolicy =
              codeObjValuePolicy.typePolicies[codeObjType] ??
              defaultCodeObjValuePolicy.typePolicies[codeObjType];
            if (!typePolicy) {
              return null;
            }
            const representationOptions =
              getCodeObjRepresentationOptions(codeObjType);
            const representationOptionsWithFallback =
              representationOptions.includes(typePolicy.representation)
                ? representationOptions
                : [typePolicy.representation, ...representationOptions];
            const representationDisabled =
              representationOptionsWithFallback.length === 1;
            return (
              <div
                key={codeObjType}
                className="flex flex-wrap items-center gap-2 rounded-md bg-white/45 px-2 py-1 dark:bg-setta-950/35"
              >
                <div className="min-w-0 basis-full truncate text-[11px] text-setta-700 dark:text-setta-200">
                  {codeObjType}
                </div>
                <select
                  className={`${PANEL_COMPACT_SELECT_CLASSES} flex-1 basis-24`}
                  disabled={isDeploymentMode || representationDisabled}
                  value={typePolicy.representation}
                  onChange={(event) => {
                    const nextRepresentation = event.target
                      .value as CodeObjValueRepresentationMode;
                    updateCodeObjValuePolicy({
                      ...codeObjValuePolicy,
                      typePolicies: {
                        ...codeObjValuePolicy.typePolicies,
                        [codeObjType]: {
                          ...typePolicy,
                          representation: nextRepresentation,
                        },
                      },
                    });
                  }}
                >
                  {representationOptionsWithFallback.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      </div>

      <div className={PANEL_CARD_CLASSES}>
        <div className="text-[11px] font-bold uppercase tracking-tight text-setta-400 dark:text-setta-500">
          Code Obj Overrides
        </div>
        <div className="mt-1 text-[11px] text-setta-600 dark:text-setta-300">
          Override representation for individual params.
        </div>
        <div className="mt-2 flex min-w-0 flex-col gap-1.5">
          <select
            className={`${PANEL_SELECT_CLASSES} w-full`}
            disabled={
              isDeploymentMode || availableCodeObjOverrides.length === 0
            }
            value={pendingCodeObjOverrideId}
            onChange={(event) => {
              setPendingCodeObjOverrideId(event.target.value);
            }}
          >
            <option value="">Select a param</option>
            {availableCodeObjOverrides.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <div className="flex justify-end">
            <button
              className={PANEL_ICON_BUTTON_CLASSES}
              disabled={isDeploymentMode || !pendingCodeObjOverrideId}
              onClick={() => {
                const selected =
                  codeObjOptionsById.get(pendingCodeObjOverrideId) ?? null;
                if (!selected) {
                  return;
                }
                const basePolicy =
                  codeObjValuePolicy.typePolicies[selected.type] ??
                  defaultCodeObjValuePolicy.typePolicies[selected.type];
                const nextOverrides = {
                  ...codeObjValuePolicy.codeObjOverrides,
                  [pendingCodeObjOverrideId]: {
                    representation:
                      basePolicy?.representation ??
                      CodeObjValueRepresentationModeEnum.expression,
                  },
                };
                updateCodeObjValuePolicy({
                  ...codeObjValuePolicy,
                  codeObjOverrides: nextOverrides,
                });
                setPendingCodeObjOverrideId("");
              }}
              type="button"
              {...getFloatingBoxHandlers({ content: "Add override" })}
            >
              <i className="gg-add" />
            </button>
          </div>
        </div>
        {codeObjOverrideEntries.length === 0 ? (
          <div className="mt-2 text-[11px] text-setta-500 dark:text-setta-400">
            No overrides yet.
          </div>
        ) : (
          <div className="mt-2 space-y-1">
            {codeObjOverrideEntries.map((entry) => {
              const representationOptions = getCodeObjRepresentationOptions(
                entry.type,
              );
              const overrideRepresentationOptions =
                representationOptions.includes(entry.override.representation)
                  ? representationOptions
                  : [entry.override.representation];
              const representationDisabled =
                overrideRepresentationOptions.length === 1;
              return (
                <div
                  key={entry.codeObjId}
                  className="flex flex-wrap items-center gap-2 rounded-md bg-white/45 px-2 py-1 dark:bg-setta-950/35"
                >
                  <div className="min-w-0 basis-full truncate text-[11px] text-setta-700 dark:text-setta-200">
                    {entry.label}
                  </div>
                  <select
                    className={`${PANEL_COMPACT_SELECT_CLASSES} flex-1 basis-24`}
                    disabled={isDeploymentMode || representationDisabled}
                    value={entry.override.representation}
                    onChange={(event) => {
                      const nextRepresentation = event.target
                        .value as CodeObjValueRepresentationMode;
                      updateCodeObjValuePolicy({
                        ...codeObjValuePolicy,
                        codeObjOverrides: {
                          ...codeObjValuePolicy.codeObjOverrides,
                          [entry.codeObjId]: {
                            ...entry.override,
                            representation: nextRepresentation,
                          },
                        },
                      });
                    }}
                  >
                    {overrideRepresentationOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <button
                    className={PANEL_ICON_BUTTON_DESTRUCTIVE_CLASSES}
                    disabled={isDeploymentMode}
                    onClick={() => {
                      const nextOverrides = {
                        ...codeObjValuePolicy.codeObjOverrides,
                      };
                      delete nextOverrides[entry.codeObjId];
                      updateCodeObjValuePolicy({
                        ...codeObjValuePolicy,
                        codeObjOverrides: nextOverrides,
                      });
                    }}
                    type="button"
                    {...getFloatingBoxHandlers({
                      content: "Remove override",
                    })}
                  >
                    <i className="gg-trash" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  const accordionItems: Array<{
    value: RunInstructionsAccordionItemValue;
    title: string;
    triggerTestId: string;
    content: React.ReactNode;
    disabled?: boolean;
    disabledReason?: string;
  }> = [];
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
                  data-testid="run-instructions-python-codegen-toggle"
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
              {pluginCodegenRegistrations.length > 0
                ? pluginCodegenRegistrations.map((registration) => (
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
                            togglePluginCodegenTarget(registration, checked)
                          }
                        >
                          <Switch.Thumb className={TOGGLE_THUMB_CLASSES} />
                        </Switch.Root>
                      </div>
                    </div>
                  ))
                : null}
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
  accordionItems.push(
    {
      value: "run-instructions-codegen-policy",
      title: "Codegen Policy",
      triggerTestId: "run-instructions-accordion-codegen-policy",
      content: codegenPolicyContent,
    },
    {
      value: "run-instructions-custom-runs",
      title: "Run Button Dropdown Items",
      triggerTestId: "run-instructions-accordion-custom-runs",
      content:
        customRuns.length === 0 ? (
          <div className={CUSTOM_RUN_EMPTY_STATE_CLASSES}>
            No custom runs yet.
          </div>
        ) : (
          <div className="space-y-0.5">
            {customRuns.map((run) => {
              const isActiveContinuousRun =
                runMode === "continuous" &&
                continuousRunStarted &&
                continuousRunCustomRunId === run.id;

              return (
                <CustomRunRow
                  key={run.id}
                  run={run}
                  projectConfigId={projectConfigId}
                  isActiveContinuousRun={isActiveContinuousRun}
                />
              );
            })}
          </div>
        ),
    },
    {
      value: "run-instructions-add-from-code-blocks",
      title: "Add From Code Blocks",
      triggerTestId: "run-instructions-accordion-add-from-code-blocks",
      disabled: runnableCodeBlocks.length === 0,
      disabledReason: "No runnable code blocks are available",
      content: (
        <div className="space-y-1">
          {runnableCodeBlocks.map((item) => (
            <AddCodeBlockRow
              key={item.sectionId}
              projectConfigId={projectConfigId}
              item={item}
            />
          ))}
        </div>
      ),
    },
  );
  const accordionItemValueSet = new Set<string>(
    accordionItems.map((item) => item.value),
  );
  const visibleAccordionOpenValues = resolvedAccordionOpenValues.filter(
    (value) => accordionItemValueSet.has(value),
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-2">
      <p
        className={`${RUN_INSTRUCTIONS_INLINE_INSET_CLASS} text-xs text-setta-500 dark:text-setta-300`}
      >
        Define custom run types (once or continuous) and choose which ones
        appear in the main Run dropdown.
      </p>
      <div
        className={`setta-pane-scroll min-h-0 flex-1 ${RUN_INSTRUCTIONS_INLINE_INSET_CLASS}`}
        data-testid="run-instructions-scroll-region"
      >
        <RunInstructionsAccordion
          openValues={visibleAccordionOpenValues}
          onOpenValuesChange={setAccordionOpenValues}
          items={accordionItems}
        />
      </div>
    </div>
  );
}

function CustomRunRow({
  run,
  projectConfigId,
  isActiveContinuousRun,
}: {
  run: CustomRunItem;
  projectConfigId: string;
  isActiveContinuousRun: boolean;
}) {
  const isContinuous = run.runMode === "continuous";
  const runIcon = isContinuous ? <RiLoopRightFill /> : <RiPlayMiniFill />;

  let runTooltip = "Run once";
  if (isContinuous) {
    runTooltip = isActiveContinuousRun
      ? "Stop continuous run"
      : "Start continuous run";
  }

  return (
    <div className={CUSTOM_RUN_ROW_CLASSES}>
      <input
        type="checkbox"
        checked={run.includeInRunDropdown}
        onChange={() => toggleCustomRunInDropdown(projectConfigId, run.id)}
        className="h-4 w-4 rounded-md bg-setta-500/10 checked:bg-blue-500 hover:bg-setta-500/30 hover:checked:bg-blue-500"
        {...getFloatingBoxHandlers({ content: "Show in Run dropdown" })}
      />
      <div className="min-w-0 flex-1 truncate text-setta-800 dark:text-setta-200">
        {run.name}
      </div>
      <select
        className={`${PANEL_COMPACT_SELECT_CLASSES} min-w-[7.5rem] shrink-0`}
        value={run.runMode}
        onChange={(e) =>
          setCustomRunMode(
            projectConfigId,
            run.id,
            e.target.value === "continuous" ? "continuous" : "once",
          )
        }
        {...getFloatingBoxHandlers({ content: "Run mode" })}
      >
        <option value="once">once</option>
        <option value="continuous">continuous</option>
      </select>
      <button
        className={`inline-flex h-6 w-6 items-center justify-center rounded focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
          isActiveContinuousRun
            ? "bg-blue-800 text-white hover:bg-blue-700"
            : "text-setta-600 hover:bg-green-500/10 hover:text-green-600 dark:text-setta-300 dark:hover:text-green-400"
        }`}
        onClick={() => {
          void runCustomRun(projectConfigId, run.id);
        }}
        type="button"
        {...getFloatingBoxHandlers({ content: runTooltip })}
      >
        {runIcon}
      </button>
      <button
        className={PANEL_ICON_BUTTON_DESTRUCTIVE_CLASSES}
        onClick={() => deleteCustomRun(projectConfigId, run.id)}
        type="button"
        {...getFloatingBoxHandlers({ content: "Delete" })}
      >
        <i className="gg-trash" />
      </button>
    </div>
  );
}

function AddCodeBlockRow({
  projectConfigId,
  item,
}: {
  projectConfigId: string;
  item: RunnableCodeBlock;
}) {
  return (
    <div
      className={`${PANEL_ROW_CLASSES} flex min-w-0 items-center gap-2`}
      style={{ paddingLeft: `${0.5 + 0.5 * item.depth}rem` }}
    >
      <button
        className={PANEL_ICON_BUTTON_CLASSES}
        onClick={() =>
          addOrGetCustomRunForCodeBlock(
            projectConfigId,
            item.sectionId,
            item.name,
          )
        }
        type="button"
        {...getFloatingBoxHandlers({ content: "Add custom run" })}
      >
        <i className="gg-add" />
      </button>
      <div className="min-w-0 flex-1 truncate text-setta-800 dark:text-setta-200">
        {item.name}
      </div>
    </div>
  );
}

function collectPluginCodegenRegistrations(
  pluginStatusEntries: PluginStatusEntry[],
): PluginCodegenRegistration[] {
  const registrationsById = new Map<string, PluginCodegenRegistration>();
  for (const pluginStatusEntry of pluginStatusEntries) {
    for (const registration of pluginStatusEntry.registeredCodegenTargets) {
      if (registrationsById.has(registration.targetId)) {
        continue;
      }
      registrationsById.set(registration.targetId, {
        targetId: registration.targetId,
        language: registration.language,
        name: registration.name,
      });
    }
  }
  return [...registrationsById.values()].sort((a, b) => {
    const byName = a.name.localeCompare(b.name);
    if (byName !== 0) {
      return byName;
    }
    const byLanguage = a.language.localeCompare(b.language);
    if (byLanguage !== 0) {
      return byLanguage;
    }
    return a.targetId.localeCompare(b.targetId);
  });
}

function useRunnableCodeBlockListing() {
  return useProjectState((x) => {
    const outputList: Array<RunnableCodeBlock> = [];
    const viewMode = getActiveViewModeConfig(x);
    const { isEditingViewMode } = x.projectConfig;
    const pythonCodegenEnabled = projectConfigHasPythonCodegen(x.projectConfig);
    for (const sectionId of Object.keys(x.projectConfig.topLevelSections)) {
      const sectionImpl = getCurrEffectiveSectionImpl(x, sectionId);
      const sectionCore = getSectionCore(x, sectionId);
      getRunnableCodeBlockListingHelper(
        sectionCore,
        sectionImpl,
        0,
        x,
        viewMode,
        isEditingViewMode,
        pythonCodegenEnabled,
        outputList,
      );
    }
    return outputList;
  }, _.isEqual);
}

function useSectionOptions(): SectionOption[] {
  return useProjectState((x) => {
    const outputList: Array<SectionOption> = [];
    for (const [sectionId, section] of Object.entries(x.sections)) {
      const sectionImpl = getCurrEffectiveSectionImpl(x, sectionId);
      outputList.push({
        id: sectionId,
        name: section.name,
        type: sectionImpl.type,
      });
    }
    outputList.sort((a, b) => a.name.localeCompare(b.name));
    return outputList;
  }, _.isEqual);
}

function useCodeObjOptions(): CodeObjOption[] {
  return useProjectState((x) => {
    const outputList: Array<CodeObjOption> = [];
    const seen = new Set<string>();
    for (const [sectionId, section] of Object.entries(x.sections)) {
      const sectionImpl = getCurrEffectiveSectionImpl(x, sectionId);
      const sectionName = section.name;
      let codeObjIds: string[] = [];
      if (isBaseSectionWithParamsImpl(sectionImpl)) {
        codeObjIds = Object.keys(sectionImpl.codeObjVariantMap);
      } else if (
        sectionImpl.type === SectionTypeEnum.MetaControl &&
        sectionImpl.metaControlParamId
      ) {
        codeObjIds = [sectionImpl.metaControlParamId];
      }
      for (const codeObjId of codeObjIds) {
        if (seen.has(codeObjId)) {
          continue;
        }
        const codeObjCore = x.codeObjs[codeObjId];
        if (!codeObjCore) {
          continue;
        }
        const impl = getCurrEffectiveCodeObjImpl(x, sectionId, codeObjId);
        if (impl.type === CodeObjTypeEnum.CodeCallable) {
          continue;
        }
        const name = codeObjCore.name;
        const label = `${sectionName} / ${name}`;
        outputList.push({
          id: codeObjId,
          name,
          type: impl.type,
          sectionName,
          label,
        });
        seen.add(codeObjId);
      }
    }
    outputList.sort((a, b) => a.label.localeCompare(b.label));
    return outputList;
  }, _.isEqual);
}

function getRepresentationOptions(
  sectionType: SectionType | null,
): SectionRepresentationMode[] {
  if (sectionType === SectionTypeEnum.Chat) {
    return ["expression", "file_path", "file_read"];
  }
  if (sectionType === SectionTypeEnum.Draw) {
    return ["file_path", "file_read"];
  }
  if (sectionType === SectionTypeEnum.Image) {
    return ["file_path", "file_read"];
  }
  if (sectionType === SectionTypeEnum.Chart) {
    return ["expression", "file_path"];
  }
  return ["expression"];
}

function getCodeObjRepresentationOptions(
  codeObjType: CodeObjType | null,
): CodeObjValueRepresentationMode[] {
  if (!codeObjType) {
    return [CodeObjValueRepresentationModeEnum.expression];
  }
  if (codeObjType === CodeObjTypeEnum.DropzoneParam) {
    return [
      CodeObjValueRepresentationModeEnum.file_path,
      CodeObjValueRepresentationModeEnum.file_read,
    ];
  }
  if (
    codeObjType === CodeObjTypeEnum.ButtonParam ||
    codeObjType === CodeObjTypeEnum.CodeCallable ||
    codeObjType === CodeObjTypeEnum.NestedParam
  ) {
    return [CodeObjValueRepresentationModeEnum.expression];
  }
  if (
    codeObjType === CodeObjTypeEnum.TextParam ||
    codeObjType === CodeObjTypeEnum.DateParam ||
    codeObjType === CodeObjTypeEnum.TimeParam ||
    codeObjType === CodeObjTypeEnum.TextAreaParam ||
    codeObjType === CodeObjTypeEnum.PasswordParam ||
    codeObjType === CodeObjTypeEnum.ColorPickerParam
  ) {
    return [CodeObjValueRepresentationModeEnum.string];
  }
  if (
    codeObjType === CodeObjTypeEnum.CodeParam ||
    codeObjType === CodeObjTypeEnum.RotaryParam ||
    codeObjType === CodeObjTypeEnum.SwitchParam ||
    codeObjType === CodeObjTypeEnum.DropdownParam
  ) {
    return [
      CodeObjValueRepresentationModeEnum.expression,
      CodeObjValueRepresentationModeEnum.string,
    ];
  }
  if (codeObjType === CodeObjTypeEnum.SliderParam) {
    return [
      CodeObjValueRepresentationModeEnum.expression,
      CodeObjValueRepresentationModeEnum.json_parsed,
      CodeObjValueRepresentationModeEnum.string,
    ];
  }
  return [CodeObjValueRepresentationModeEnum.expression];
}

function getRunnableCodeBlockListingHelper(
  section: Core,
  sectionImpl: BaseSectionImplUnion,
  depth: number,
  x: ZustandProjectState,
  viewMode: ViewModeConfig,
  isEditingViewMode: boolean,
  pythonCodegenEnabled: boolean,
  outputList: Array<RunnableCodeBlock>,
) {
  const codeLanguage =
    sectionImpl.type === SectionTypeEnum.Code
      ? sectionImpl.codeLanguage
      : undefined;
  const isRunnable = isRunnableSectionForCustomRun(
    sectionImpl.type,
    pythonCodegenEnabled,
    codeLanguage,
  );

  const visibility = viewMode.visibilityBySectionId[section.id];
  if (visibility === undefined) {
    throw new Error(
      `Missing visibility for section ${section.id} in view mode ${viewMode.id}`,
    );
  }
  if (isRunnable && getSectionShouldRender(visibility, isEditingViewMode)) {
    outputList.push({ sectionId: section.id, name: section.name, depth });
  }

  if (isBaseParentSectionImpl(sectionImpl)) {
    for (const childId of sectionImpl.children) {
      const childSection = x.sections[childId];
      if (!childSection) {
        continue;
      }
      const childImpl = getCurrEffectiveSectionImpl(x, childId);
      getRunnableCodeBlockListingHelper(
        childSection,
        childImpl,
        depth + 1,
        x,
        viewMode,
        isEditingViewMode,
        pythonCodegenEnabled,
        outputList,
      );
    }
  }
}
