import * as Switch from "@radix-ui/react-switch";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import _ from "lodash";
import React from "react";
import {
  getCurrEffectiveCodeObjImpl,
  getCurrEffectiveSectionImpl,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import {
  CodeObjTypeEnum,
  CodeObjValueRepresentationModeEnum,
  createCodeObjValuePolicy,
  createSectionCodegenPolicy,
  isBaseSectionWithParamsImpl,
  SectionTypeEnum,
  type CodeObjValueRepresentationMode,
  type ProjectCodegenPythonTarget,
} from "utils/generatedTypes";
import {
  CODEGEN_CODE_OBJ_TYPES,
  CODEGEN_SECTION_TYPES,
  getCodeObjRepresentationOptions,
  getRepresentationOptions,
  META_CONTROL_CODE_OBJ_LABELS,
  META_CONTROL_CODE_OBJ_TYPES,
  SECTION_CODEGEN_MODE_OPTIONS,
  type CodeObjOption,
  type SectionCodegenMode,
  type SectionOption,
  type SectionRepresentationMode,
} from "./runInstructionsCodegenModel";

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

export function RunInstructionsCodegenPolicyContent({
  isDeploymentMode,
  pythonCodegenEnabled,
  pythonTarget,
  updatePythonTarget,
  updateSectionPolicy,
  updateCodeObjValuePolicy,
}: {
  isDeploymentMode: boolean;
  pythonCodegenEnabled: boolean;
  pythonTarget: ProjectCodegenPythonTarget;
  updatePythonTarget: (
    updater: (target: ProjectCodegenPythonTarget) => ProjectCodegenPythonTarget,
  ) => void;
  updateSectionPolicy: (
    nextPolicy: ProjectCodegenPythonTarget["sectionPolicy"],
  ) => void;
  updateCodeObjValuePolicy: (
    nextPolicy: ProjectCodegenPythonTarget["codeObjValuePolicy"],
  ) => void;
}) {
  const defaultSectionPolicy = React.useMemo(
    () => createSectionCodegenPolicy(),
    [],
  );
  const defaultCodeObjValuePolicy = React.useMemo(
    () => createCodeObjValuePolicy(),
    [],
  );
  const sectionPolicy = pythonTarget.sectionPolicy;
  const codeObjValuePolicy = pythonTarget.codeObjValuePolicy;
  const defaultAllowlist = defaultSectionPolicy.allowlist ?? [];
  const defaultMetaControlAllowlist =
    defaultSectionPolicy.metaControlAllowlist ?? META_CONTROL_CODE_OBJ_TYPES;
  const [cachedAllowlist, setCachedAllowlist] = React.useState(
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

  const allowlistEnabled = sectionPolicy.allowlist !== null;
  const allowlist = sectionPolicy.allowlist ?? cachedAllowlist;
  const metaControlAllowlist =
    sectionPolicy.metaControlAllowlist ?? defaultMetaControlAllowlist;
  const availableOverrideSections = React.useMemo(
    () =>
      sectionOptions
        .filter((option) => !sectionPolicy.sectionOverrides[option.id])
        .sort((a, b) => a.name.localeCompare(b.name)),
    [sectionOptions, sectionPolicy.sectionOverrides],
  );
  const overrideEntries = React.useMemo(
    () =>
      Object.entries(sectionPolicy.sectionOverrides)
        .map(([sectionId, override]) => {
          const section = sectionOptionsById.get(sectionId) ?? null;
          return {
            sectionId,
            override,
            name: section?.name ?? sectionId,
            type: section?.type ?? null,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    [sectionOptionsById, sectionPolicy.sectionOverrides],
  );
  const availableCodeObjOverrides = React.useMemo(
    () =>
      codeObjOptions
        .filter((option) => !codeObjValuePolicy.codeObjOverrides[option.id])
        .sort((a, b) => a.label.localeCompare(b.label)),
    [codeObjOptions, codeObjValuePolicy.codeObjOverrides],
  );
  const codeObjOverrideEntries = React.useMemo(
    () =>
      Object.entries(codeObjValuePolicy.codeObjOverrides)
        .map(([codeObjId, override]) => {
          const codeObj = codeObjOptionsById.get(codeObjId) ?? null;
          return {
            codeObjId,
            override,
            label: codeObj?.label ?? codeObjId,
            type: codeObj?.type ?? null,
          };
        })
        .sort((a, b) => a.label.localeCompare(b.label)),
    [codeObjOptionsById, codeObjValuePolicy.codeObjOverrides],
  );

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

  if (!pythonCodegenEnabled) {
    return (
      <div className="mx-[2px] rounded border border-dashed border-setta-200 bg-white/40 p-2 text-[11px] text-setta-600 dark:border-setta-800 dark:bg-setta-900/40 dark:text-setta-300">
        Enable Python codegen to edit section policy settings.
      </div>
    );
  }

  return (
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
}

function useSectionOptions(): SectionOption[] {
  return useProjectState((state) => {
    const outputList: Array<SectionOption> = [];
    for (const [sectionId, section] of Object.entries(state.sections)) {
      const sectionImpl = getCurrEffectiveSectionImpl(state, sectionId);
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
  return useProjectState((state) => {
    const outputList: Array<CodeObjOption> = [];
    const seen = new Set<string>();
    for (const [sectionId, section] of Object.entries(state.sections)) {
      const sectionImpl = getCurrEffectiveSectionImpl(state, sectionId);
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
        const codeObjCore = state.codeObjs[codeObjId];
        if (!codeObjCore) {
          continue;
        }
        const impl = getCurrEffectiveCodeObjImpl(state, sectionId, codeObjId);
        if (impl.type === CodeObjTypeEnum.CodeCallable) {
          continue;
        }
        const name = codeObjCore.name;
        outputList.push({
          id: codeObjId,
          name,
          type: impl.type,
          sectionName,
          label: `${sectionName} / ${name}`,
        });
        seen.add(codeObjId);
      }
    }
    outputList.sort((a, b) => a.label.localeCompare(b.label));
    return outputList;
  }, _.isEqual);
}
