import * as Switch from "@radix-ui/react-switch";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import React from "react";
import {
  CodeObjTypeEnum,
  CodeObjValueRepresentationModeEnum,
  SectionTypeEnum,
  type CodeObjType,
  type CodeObjValueRepresentationMode,
  type ProjectCodegenPythonTarget,
  type SectionType,
} from "utils/generatedTypes";

type SectionPolicy = ProjectCodegenPythonTarget["sectionPolicy"];
type CodeObjValuePolicy = ProjectCodegenPythonTarget["codeObjValuePolicy"];
type SectionCodegenOverride = SectionPolicy["sectionOverrides"][string];
type CodeObjValueOverride = CodeObjValuePolicy["codeObjOverrides"][string];

type SectionCodegenMode = SectionCodegenOverride["mode"];
type SectionRepresentationMode = SectionCodegenOverride["representation"];

export type RunInstructionsSectionOption = {
  id: string;
  name: string;
  type: SectionType;
};

export type RunInstructionsCodeObjOption = {
  id: string;
  name: string;
  type: CodeObjType;
  sectionName: string;
  label: string;
};

type RunInstructionsSectionOverrideEntry = {
  sectionId: string;
  override: SectionCodegenOverride;
  name: string;
  type: SectionType | null;
};

type RunInstructionsCodeObjOverrideEntry = {
  codeObjId: string;
  override: CodeObjValueOverride;
  label: string;
  type: CodeObjType | null;
};

export type RunInstructionsCodegenPolicyStyles = {
  toggleRoot: string;
  toggleThumb: string;
  toggleLabel: string;
  panelCard: string;
  panelRow: string;
  panelSelect: string;
  panelCompactSelect: string;
  panelIconButton: string;
  panelIconButtonDestructive: string;
};

type RunInstructionsCodegenPolicyProps = {
  styles: RunInstructionsCodegenPolicyStyles;
  isDeploymentMode: boolean;
  pythonCodegenEnabled: boolean;
  pythonTarget: ProjectCodegenPythonTarget;
  sectionPolicy: SectionPolicy;
  codeObjValuePolicy: CodeObjValuePolicy;
  defaultCodeObjValuePolicy: CodeObjValuePolicy;
  allowlistEnabled: boolean;
  allowlist: SectionType[];
  metaControlAllowlist: CodeObjType[];
  pendingOverrideId: string;
  pendingCodeObjOverrideId: string;
  availableOverrideSections: RunInstructionsSectionOption[];
  overrideEntries: RunInstructionsSectionOverrideEntry[];
  availableCodeObjOverrides: RunInstructionsCodeObjOption[];
  codeObjOverrideEntries: RunInstructionsCodeObjOverrideEntry[];
  sectionOptionsById: Map<string, RunInstructionsSectionOption>;
  codeObjOptionsById: Map<string, RunInstructionsCodeObjOption>;
  setPendingOverrideId: React.Dispatch<React.SetStateAction<string>>;
  setPendingCodeObjOverrideId: React.Dispatch<React.SetStateAction<string>>;
  updatePythonTarget: (
    updater: (target: ProjectCodegenPythonTarget) => ProjectCodegenPythonTarget,
  ) => void;
  updateSectionPolicy: (nextPolicy: SectionPolicy) => void;
  updateCodeObjValuePolicy: (nextPolicy: CodeObjValuePolicy) => void;
};

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

const DEFAULT_SECTION_REPRESENTATION_OPTIONS: readonly SectionRepresentationMode[] =
  ["expression"];

const SECTION_REPRESENTATION_OPTIONS_BY_TYPE: Partial<
  Record<SectionType, readonly SectionRepresentationMode[]>
> = {
  [SectionTypeEnum.Chat]: ["expression", "file_path", "file_read"],
  [SectionTypeEnum.Draw]: ["file_path", "file_read"],
  [SectionTypeEnum.Image]: ["file_path", "file_read"],
  [SectionTypeEnum.Chart]: ["expression", "file_path"],
};

const DEFAULT_CODE_OBJ_REPRESENTATION_OPTIONS: readonly CodeObjValueRepresentationMode[] =
  [CodeObjValueRepresentationModeEnum.expression];

const CODE_OBJ_REPRESENTATION_OPTIONS_BY_TYPE: Partial<
  Record<CodeObjType, readonly CodeObjValueRepresentationMode[]>
> = {
  [CodeObjTypeEnum.DropzoneParam]: [
    CodeObjValueRepresentationModeEnum.file_path,
    CodeObjValueRepresentationModeEnum.file_read,
  ],
  [CodeObjTypeEnum.ButtonParam]: [
    CodeObjValueRepresentationModeEnum.expression,
  ],
  [CodeObjTypeEnum.CodeCallable]: [
    CodeObjValueRepresentationModeEnum.expression,
  ],
  [CodeObjTypeEnum.NestedParam]: [
    CodeObjValueRepresentationModeEnum.expression,
  ],
  [CodeObjTypeEnum.TextParam]: [CodeObjValueRepresentationModeEnum.string],
  [CodeObjTypeEnum.DateParam]: [CodeObjValueRepresentationModeEnum.string],
  [CodeObjTypeEnum.TimeParam]: [CodeObjValueRepresentationModeEnum.string],
  [CodeObjTypeEnum.TextAreaParam]: [CodeObjValueRepresentationModeEnum.string],
  [CodeObjTypeEnum.PasswordParam]: [CodeObjValueRepresentationModeEnum.string],
  [CodeObjTypeEnum.ColorPickerParam]: [
    CodeObjValueRepresentationModeEnum.string,
  ],
  [CodeObjTypeEnum.CodeParam]: [
    CodeObjValueRepresentationModeEnum.expression,
    CodeObjValueRepresentationModeEnum.string,
  ],
  [CodeObjTypeEnum.RotaryParam]: [
    CodeObjValueRepresentationModeEnum.expression,
    CodeObjValueRepresentationModeEnum.string,
  ],
  [CodeObjTypeEnum.SwitchParam]: [
    CodeObjValueRepresentationModeEnum.expression,
    CodeObjValueRepresentationModeEnum.string,
  ],
  [CodeObjTypeEnum.DropdownParam]: [
    CodeObjValueRepresentationModeEnum.expression,
    CodeObjValueRepresentationModeEnum.string,
  ],
  [CodeObjTypeEnum.SliderParam]: [
    CodeObjValueRepresentationModeEnum.expression,
    CodeObjValueRepresentationModeEnum.json_parsed,
    CodeObjValueRepresentationModeEnum.string,
  ],
};

function getSectionRepresentationOptions(
  sectionType: SectionType | null,
): readonly SectionRepresentationMode[] {
  if (!sectionType) {
    return DEFAULT_SECTION_REPRESENTATION_OPTIONS;
  }
  return (
    SECTION_REPRESENTATION_OPTIONS_BY_TYPE[sectionType] ??
    DEFAULT_SECTION_REPRESENTATION_OPTIONS
  );
}

function getCodeObjRepresentationOptions(
  codeObjType: CodeObjType | null,
): readonly CodeObjValueRepresentationMode[] {
  if (!codeObjType) {
    return DEFAULT_CODE_OBJ_REPRESENTATION_OPTIONS;
  }
  return (
    CODE_OBJ_REPRESENTATION_OPTIONS_BY_TYPE[codeObjType] ??
    DEFAULT_CODE_OBJ_REPRESENTATION_OPTIONS
  );
}

function prependFallbackOption<T>(
  options: readonly T[],
  fallback: T,
): readonly T[] {
  if (options.includes(fallback)) {
    return options;
  }
  return [fallback, ...options];
}

function toggleArrayValue<T>(
  values: readonly T[],
  value: T,
  checked: boolean,
): T[] {
  if (checked) {
    return Array.from(new Set([...values, value]));
  }
  return values.filter((item) => item !== value);
}

export function RunInstructionsCodegenPolicy({
  styles,
  isDeploymentMode,
  pythonCodegenEnabled,
  pythonTarget,
  sectionPolicy,
  codeObjValuePolicy,
  defaultCodeObjValuePolicy,
  allowlistEnabled,
  allowlist,
  metaControlAllowlist,
  pendingOverrideId,
  pendingCodeObjOverrideId,
  availableOverrideSections,
  overrideEntries,
  availableCodeObjOverrides,
  codeObjOverrideEntries,
  sectionOptionsById,
  codeObjOptionsById,
  setPendingOverrideId,
  setPendingCodeObjOverrideId,
  updatePythonTarget,
  updateSectionPolicy,
  updateCodeObjValuePolicy,
}: RunInstructionsCodegenPolicyProps) {
  if (!pythonCodegenEnabled) {
    return (
      <div
        className="mx-[2px] rounded border border-dashed border-setta-200 bg-white/40 p-2 text-[11px] text-setta-600 dark:border-setta-800 dark:bg-setta-900/40 dark:text-setta-300"
        data-testid="run-instructions-codegen-policy-disabled-message"
      >
        Enable Python codegen to edit section policy settings.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <GeneratedMetadataRow
        styles={styles}
        isDeploymentMode={isDeploymentMode}
        pythonTarget={pythonTarget}
        updatePythonTarget={updatePythonTarget}
      />
      <SectionAllowlistCard
        styles={styles}
        isDeploymentMode={isDeploymentMode}
        sectionPolicy={sectionPolicy}
        allowlistEnabled={allowlistEnabled}
        allowlist={allowlist}
        metaControlAllowlist={metaControlAllowlist}
        updateSectionPolicy={updateSectionPolicy}
      />
      <SectionTypeDefaultsCard
        styles={styles}
        isDeploymentMode={isDeploymentMode}
        sectionPolicy={sectionPolicy}
        updateSectionPolicy={updateSectionPolicy}
      />
      <SectionOverridesCard
        styles={styles}
        isDeploymentMode={isDeploymentMode}
        sectionPolicy={sectionPolicy}
        pendingOverrideId={pendingOverrideId}
        availableOverrideSections={availableOverrideSections}
        overrideEntries={overrideEntries}
        sectionOptionsById={sectionOptionsById}
        setPendingOverrideId={setPendingOverrideId}
        updateSectionPolicy={updateSectionPolicy}
      />
      <CodeObjTypeDefaultsCard
        styles={styles}
        isDeploymentMode={isDeploymentMode}
        codeObjValuePolicy={codeObjValuePolicy}
        defaultCodeObjValuePolicy={defaultCodeObjValuePolicy}
        updateCodeObjValuePolicy={updateCodeObjValuePolicy}
      />
      <CodeObjOverridesCard
        styles={styles}
        isDeploymentMode={isDeploymentMode}
        codeObjValuePolicy={codeObjValuePolicy}
        defaultCodeObjValuePolicy={defaultCodeObjValuePolicy}
        pendingCodeObjOverrideId={pendingCodeObjOverrideId}
        availableCodeObjOverrides={availableCodeObjOverrides}
        codeObjOverrideEntries={codeObjOverrideEntries}
        codeObjOptionsById={codeObjOptionsById}
        setPendingCodeObjOverrideId={setPendingCodeObjOverrideId}
        updateCodeObjValuePolicy={updateCodeObjValuePolicy}
      />
    </div>
  );
}

function GeneratedMetadataRow({
  styles,
  isDeploymentMode,
  pythonTarget,
  updatePythonTarget,
}: {
  styles: RunInstructionsCodegenPolicyStyles;
  isDeploymentMode: boolean;
  pythonTarget: ProjectCodegenPythonTarget;
  updatePythonTarget: (
    updater: (target: ProjectCodegenPythonTarget) => ProjectCodegenPythonTarget,
  ) => void;
}) {
  return (
    <div
      className={`${styles.panelRow} flex min-w-0 flex-wrap items-center gap-2`}
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
        <span className={styles.toggleLabel}>Meta</span>
        <Switch.Root
          className={styles.toggleRoot}
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
          <Switch.Thumb className={styles.toggleThumb} />
        </Switch.Root>
      </div>
    </div>
  );
}

function SectionAllowlistCard({
  styles,
  isDeploymentMode,
  sectionPolicy,
  allowlistEnabled,
  allowlist,
  metaControlAllowlist,
  updateSectionPolicy,
}: {
  styles: RunInstructionsCodegenPolicyStyles;
  isDeploymentMode: boolean;
  sectionPolicy: SectionPolicy;
  allowlistEnabled: boolean;
  allowlist: SectionType[];
  metaControlAllowlist: CodeObjType[];
  updateSectionPolicy: (nextPolicy: SectionPolicy) => void;
}) {
  return (
    <div className={styles.panelCard}>
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
          <span className={styles.toggleLabel}>Allowlist</span>
          <Switch.Root
            className={styles.toggleRoot}
            checked={allowlistEnabled}
            disabled={isDeploymentMode}
            onCheckedChange={(checked) => {
              updateSectionPolicy({
                ...sectionPolicy,
                allowlist: checked ? allowlist : null,
              });
            }}
          >
            <Switch.Thumb className={styles.toggleThumb} />
          </Switch.Root>
        </div>
      </div>
      {allowlistEnabled ? (
        <div className="mt-2 grid grid-cols-1 gap-y-1">
          {CODEGEN_SECTION_TYPES.map((sectionType) => {
            const isChecked = allowlist.includes(sectionType);
            const isMetaControl = sectionType === SectionTypeEnum.MetaControl;
            return (
              <div key={sectionType} className="flex flex-col gap-1">
                <label className="flex items-center gap-2 text-[11px] text-setta-600 dark:text-setta-300">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={isDeploymentMode}
                    onChange={(event) => {
                      updateSectionPolicy({
                        ...sectionPolicy,
                        allowlist: toggleArrayValue(
                          allowlist,
                          sectionType,
                          event.target.checked,
                        ),
                      });
                    }}
                    className="h-4 w-4 rounded-md bg-setta-500/10 checked:bg-blue-500 hover:bg-setta-500/30 hover:checked:bg-blue-500"
                  />
                  <span>{sectionType}</span>
                </label>
                {isChecked && isMetaControl ? (
                  <div className="ml-6 grid grid-cols-1 gap-y-1">
                    {META_CONTROL_CODE_OBJ_TYPES.map((codeObjType) => (
                      <label
                        key={codeObjType}
                        className="flex items-center gap-2 text-[11px] text-setta-500 dark:text-setta-400"
                      >
                        <input
                          type="checkbox"
                          checked={metaControlAllowlist.includes(codeObjType)}
                          disabled={isDeploymentMode}
                          onChange={(event) => {
                            updateSectionPolicy({
                              ...sectionPolicy,
                              metaControlAllowlist: toggleArrayValue(
                                metaControlAllowlist,
                                codeObjType,
                                event.target.checked,
                              ),
                            });
                          }}
                          className="h-4 w-4 rounded-md bg-setta-500/10 checked:bg-blue-500 hover:bg-setta-500/30 hover:checked:bg-blue-500"
                        />
                        <span>{META_CONTROL_CODE_OBJ_LABELS[codeObjType]}</span>
                      </label>
                    ))}
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
  );
}

function SectionTypeDefaultsCard({
  styles,
  isDeploymentMode,
  sectionPolicy,
  updateSectionPolicy,
}: {
  styles: RunInstructionsCodegenPolicyStyles;
  isDeploymentMode: boolean;
  sectionPolicy: SectionPolicy;
  updateSectionPolicy: (nextPolicy: SectionPolicy) => void;
}) {
  return (
    <div className={styles.panelCard}>
      <div className="text-[11px] font-bold uppercase tracking-tight text-setta-400 dark:text-setta-500">
        Section Type Defaults
      </div>
      <div className="mt-1 space-y-1">
        {CODEGEN_SECTION_TYPES.map((sectionType) => {
          const typePolicy = sectionPolicy.typePolicies[sectionType];
          const isMetaControl = sectionType === SectionTypeEnum.MetaControl;
          const representationOptions = isMetaControl
            ? []
            : getSectionRepresentationOptions(sectionType);
          const representationOptionsWithFallback = isMetaControl
            ? []
            : prependFallbackOption(
                representationOptions,
                typePolicy.representation,
              );
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
                className={`${styles.panelCompactSelect} flex-1 basis-20`}
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
                  className={`${styles.panelCompactSelect} flex-1 basis-24`}
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
  );
}

function SectionOverridesCard({
  styles,
  isDeploymentMode,
  sectionPolicy,
  pendingOverrideId,
  availableOverrideSections,
  overrideEntries,
  sectionOptionsById,
  setPendingOverrideId,
  updateSectionPolicy,
}: {
  styles: RunInstructionsCodegenPolicyStyles;
  isDeploymentMode: boolean;
  sectionPolicy: SectionPolicy;
  pendingOverrideId: string;
  availableOverrideSections: RunInstructionsSectionOption[];
  overrideEntries: RunInstructionsSectionOverrideEntry[];
  sectionOptionsById: Map<string, RunInstructionsSectionOption>;
  setPendingOverrideId: React.Dispatch<React.SetStateAction<string>>;
  updateSectionPolicy: (nextPolicy: SectionPolicy) => void;
}) {
  return (
    <div className={styles.panelCard}>
      <div className="text-[11px] font-bold uppercase tracking-tight text-setta-400 dark:text-setta-500">
        Section Overrides
      </div>
      <div className="mt-1 text-[11px] text-setta-600 dark:text-setta-300">
        Include or exclude individual sections and set their representation.
      </div>
      <div className="mt-2 flex min-w-0 flex-col gap-1.5">
        <select
          className={`${styles.panelSelect} w-full`}
          data-testid="run-instructions-section-override-select"
          disabled={isDeploymentMode || availableOverrideSections.length === 0}
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
            className={styles.panelIconButton}
            data-testid="run-instructions-section-override-add"
            disabled={isDeploymentMode || !pendingOverrideId}
            onClick={() => {
              const selected =
                sectionOptionsById.get(pendingOverrideId) ?? null;
              if (!selected) {
                return;
              }
              const basePolicy = sectionPolicy.typePolicies[selected.type];
              updateSectionPolicy({
                ...sectionPolicy,
                sectionOverrides: {
                  ...sectionPolicy.sectionOverrides,
                  [pendingOverrideId]: {
                    mode: basePolicy.mode,
                    representation: basePolicy.representation,
                  },
                },
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
              : getSectionRepresentationOptions(entry.type);
            const overrideRepresentationOptions = isMetaControl
              ? []
              : prependFallbackOption(
                  representationOptions,
                  entry.override.representation,
                );
            const representationDisabled =
              overrideRepresentationOptions.length === 1;
            return (
              <div
                key={entry.sectionId}
                className="flex flex-wrap items-center gap-2 rounded-md bg-white/45 px-2 py-1 dark:bg-setta-950/35"
                data-testid={`run-instructions-section-override-${entry.sectionId}`}
              >
                <div className="min-w-0 basis-full truncate text-[11px] text-setta-700 dark:text-setta-200">
                  {entry.name}
                </div>
                <select
                  className={`${styles.panelCompactSelect} flex-1 basis-20`}
                  data-testid={`run-instructions-section-override-mode-${entry.sectionId}`}
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
                    className={`${styles.panelCompactSelect} flex-1 basis-24`}
                    data-testid={`run-instructions-section-override-representation-${entry.sectionId}`}
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
                  className={styles.panelIconButtonDestructive}
                  data-testid={`run-instructions-section-override-remove-${entry.sectionId}`}
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
  );
}

function CodeObjTypeDefaultsCard({
  styles,
  isDeploymentMode,
  codeObjValuePolicy,
  defaultCodeObjValuePolicy,
  updateCodeObjValuePolicy,
}: {
  styles: RunInstructionsCodegenPolicyStyles;
  isDeploymentMode: boolean;
  codeObjValuePolicy: CodeObjValuePolicy;
  defaultCodeObjValuePolicy: CodeObjValuePolicy;
  updateCodeObjValuePolicy: (nextPolicy: CodeObjValuePolicy) => void;
}) {
  return (
    <div className={styles.panelCard}>
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
          const representationOptionsWithFallback = prependFallbackOption(
            getCodeObjRepresentationOptions(codeObjType),
            typePolicy.representation,
          );
          return (
            <div
              key={codeObjType}
              className="flex flex-wrap items-center gap-2 rounded-md bg-white/45 px-2 py-1 dark:bg-setta-950/35"
            >
              <div className="min-w-0 basis-full truncate text-[11px] text-setta-700 dark:text-setta-200">
                {codeObjType}
              </div>
              <select
                className={`${styles.panelCompactSelect} flex-1 basis-24`}
                disabled={
                  isDeploymentMode ||
                  representationOptionsWithFallback.length === 1
                }
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
  );
}

function CodeObjOverridesCard({
  styles,
  isDeploymentMode,
  codeObjValuePolicy,
  defaultCodeObjValuePolicy,
  pendingCodeObjOverrideId,
  availableCodeObjOverrides,
  codeObjOverrideEntries,
  codeObjOptionsById,
  setPendingCodeObjOverrideId,
  updateCodeObjValuePolicy,
}: {
  styles: RunInstructionsCodegenPolicyStyles;
  isDeploymentMode: boolean;
  codeObjValuePolicy: CodeObjValuePolicy;
  defaultCodeObjValuePolicy: CodeObjValuePolicy;
  pendingCodeObjOverrideId: string;
  availableCodeObjOverrides: RunInstructionsCodeObjOption[];
  codeObjOverrideEntries: RunInstructionsCodeObjOverrideEntry[];
  codeObjOptionsById: Map<string, RunInstructionsCodeObjOption>;
  setPendingCodeObjOverrideId: React.Dispatch<React.SetStateAction<string>>;
  updateCodeObjValuePolicy: (nextPolicy: CodeObjValuePolicy) => void;
}) {
  return (
    <div className={styles.panelCard}>
      <div className="text-[11px] font-bold uppercase tracking-tight text-setta-400 dark:text-setta-500">
        Code Obj Overrides
      </div>
      <div className="mt-1 text-[11px] text-setta-600 dark:text-setta-300">
        Override representation for individual params.
      </div>
      <div className="mt-2 flex min-w-0 flex-col gap-1.5">
        <select
          className={`${styles.panelSelect} w-full`}
          data-testid="run-instructions-codeobj-override-select"
          disabled={isDeploymentMode || availableCodeObjOverrides.length === 0}
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
            className={styles.panelIconButton}
            data-testid="run-instructions-codeobj-override-add"
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
              if (!basePolicy) {
                return;
              }
              updateCodeObjValuePolicy({
                ...codeObjValuePolicy,
                codeObjOverrides: {
                  ...codeObjValuePolicy.codeObjOverrides,
                  [pendingCodeObjOverrideId]: {
                    representation: basePolicy.representation,
                  },
                },
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
            const representationOptionsWithFallback = prependFallbackOption(
              getCodeObjRepresentationOptions(entry.type),
              entry.override.representation,
            );
            return (
              <div
                key={entry.codeObjId}
                className="flex flex-wrap items-center gap-2 rounded-md bg-white/45 px-2 py-1 dark:bg-setta-950/35"
                data-testid={`run-instructions-codeobj-override-${entry.codeObjId}`}
              >
                <div className="min-w-0 basis-full truncate text-[11px] text-setta-700 dark:text-setta-200">
                  {entry.label}
                </div>
                <select
                  className={`${styles.panelCompactSelect} flex-1 basis-24`}
                  data-testid={`run-instructions-codeobj-override-representation-${entry.codeObjId}`}
                  disabled={
                    isDeploymentMode ||
                    representationOptionsWithFallback.length === 1
                  }
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
                  {representationOptionsWithFallback.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <button
                  className={styles.panelIconButtonDestructive}
                  data-testid={`run-instructions-codeobj-override-remove-${entry.codeObjId}`}
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
  );
}
