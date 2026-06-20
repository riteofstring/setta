import type {
  CartographerRun,
  CartographerProcessingState,
  ChatModelOption,
  ChatReasoningEffortOption,
  ReasoningEffort,
  SemanticCartographerAuditCaptureLevel,
  SemanticCartographerModelSelection,
  SemanticCartographerSettingsInput,
  SemanticCartographerSettingsMetadata,
  SemanticCartographerSettingsRecord,
  SemanticCartographerTaskConfig,
} from "@generated/backend";
import { create } from "zustand";

import {
  createCartographerAuditRecordingSnapshot,
  emitCartographerAuditRecordingSnapshot,
} from "../lib/semantic-cartographer-recording";
import { useWorkspaceStore } from "./workspace-store";

export type SemanticCartographerSettingsStatus = "idle" | "loading" | "ready" | "saving" | "error";
export type SemanticCartographerTaskProfile = "live" | "final";

interface SemanticCartographerSettingsStore {
  dirty: boolean;
  draft: SemanticCartographerSettingsInput | null;
  error: string | null;
  fieldErrors: Record<string, string>;
  metadata: SemanticCartographerSettingsMetadata | null;
  modelOptions: ChatModelOption[];
  modelOptionsWorkspaceId: string | null;
  processingState: CartographerProcessingState | null;
  recentRuns: CartographerRun[];
  record: SemanticCartographerSettingsRecord | null;
  refresh: () => Promise<void>;
  resetDraftToDefaults: () => void;
  revertDraft: () => void;
  saveDraft: () => Promise<void>;
  selectedWorkspaceId: string | null;
  setAuditCaptureLevel: (captureLevel: SemanticCartographerAuditCaptureLevel) => void;
  setAutomaticProcessingEnabled: (enabled: boolean) => void;
  setNumberField: (field: string, value: number) => void;
  setTaskInputBudget: (profile: SemanticCartographerTaskProfile, value: number) => void;
  setTaskModelId: (profile: SemanticCartographerTaskProfile, modelId: string) => void;
  setTaskModelSelection: (
    profile: SemanticCartographerTaskProfile,
    modelSelection: SemanticCartographerModelSelection,
  ) => void;
  setTaskReasoningEffort: (
    profile: SemanticCartographerTaskProfile,
    reasoningEffort: ReasoningEffort,
  ) => void;
  status: SemanticCartographerSettingsStatus;
}

let refreshGeneration = 0;

export const useSemanticCartographerSettingsStore = create<SemanticCartographerSettingsStore>(
  (set, get) => {
    function commitDraft(draft: SemanticCartographerSettingsInput) {
      set({
        dirty: !cartographerSettingsInputEqual(draft, inputFromRecord(get().record)),
        draft,
        error: null,
        fieldErrors: validateCartographerSettingsDraft(draft, get().metadata, get().modelOptions),
      });
    }

    return {
      dirty: false,
      draft: null,
      error: null,
      fieldErrors: {},
      metadata: null,
      modelOptions: [],
      modelOptionsWorkspaceId: null,
      processingState: null,
      recentRuns: [],
      record: null,
      refresh: async () => {
        const generation = ++refreshGeneration;
        const workspaceId = selectedWorkspaceIdFromWorkspaceStore();
        set({
          error: null,
          modelOptionsWorkspaceId: workspaceId,
          selectedWorkspaceId: workspaceId,
          status: "loading",
        });
        try {
          const [metadata, processingState, modelOptions, recentRuns] = await Promise.all([
            window.setta.semanticGraph.readCartographerSettingsMetadata({}),
            window.setta.semanticGraph.readCartographerProcessingState({}),
            workspaceId
              ? window.setta.semanticGraph.listCartographerModelOptions({ workspaceId })
              : Promise.resolve([]),
            workspaceId
              ? window.setta.semanticGraph
                  .listCartographerRuns({
                    chatRunId: "",
                    limit: 5,
                    targetEntityId: "",
                    workflowExecutionId: "",
                    workspaceId,
                  })
                  .then((list) => list.runs)
              : Promise.resolve([]),
          ]);
          if (generation !== refreshGeneration) {
            return;
          }
          const draft = inputFromRecord(metadata.record);
          emitCartographerAuditRecordingSnapshot(
            createCartographerAuditRecordingSnapshot({
              capturedAt: new Date().toISOString(),
              processingState,
              recentRuns,
              settings: metadata.record,
              trigger: "settings_refresh",
              workspaceId: workspaceId ?? "",
            }),
          );
          set({
            dirty: false,
            draft,
            error: null,
            fieldErrors: validateCartographerSettingsDraft(draft, metadata, modelOptions),
            metadata,
            modelOptions,
            modelOptionsWorkspaceId: workspaceId,
            processingState,
            recentRuns,
            record: metadata.record,
            selectedWorkspaceId: workspaceId,
            status: "ready",
          });
        } catch (error) {
          if (generation !== refreshGeneration) {
            return;
          }
          set({ error: errorMessage(error), status: "error" });
        }
      },
      resetDraftToDefaults: () => {
        const metadata = get().metadata;
        if (!metadata) {
          return;
        }
        commitDraft(cloneSettingsInput(metadata.defaultSettings));
      },
      revertDraft: () => {
        const record = get().record;
        if (!record) {
          return;
        }
        const draft = inputFromRecord(record);
        if (!draft) {
          return;
        }
        commitDraft(draft);
      },
      saveDraft: async () => {
        const draft = get().draft;
        if (!draft) {
          return;
        }
        const workspaceId = selectedWorkspaceIdFromWorkspaceStore();
        if (!workspaceId) {
          set({
            error: "Select a workspace to validate and save cartographer settings.",
            selectedWorkspaceId: null,
            status: "error",
          });
          return;
        }
        const fieldErrors = validateCartographerSettingsDraft(
          draft,
          get().metadata,
          get().modelOptions,
        );
        if (Object.keys(fieldErrors).length > 0) {
          set({
            error: "Resolve cartographer settings validation errors before saving.",
            fieldErrors,
            selectedWorkspaceId: workspaceId,
            status: "error",
          });
          return;
        }
        const generation = ++refreshGeneration;
        set({ error: null, selectedWorkspaceId: workspaceId, status: "saving" });
        try {
          const record = await window.setta.semanticGraph.updateCartographerSettings({
            settings: draft,
            workspaceId,
          });
          const processingState = await window.setta.semanticGraph.readCartographerProcessingState(
            {},
          );
          const recentRuns = await window.setta.semanticGraph
            .listCartographerRuns({
              chatRunId: "",
              limit: 5,
              targetEntityId: "",
              workflowExecutionId: "",
              workspaceId,
            })
            .then((list) => list.runs);
          if (generation !== refreshGeneration) {
            return;
          }
          const nextDraft = inputFromRecord(record);
          if (!nextDraft) {
            return;
          }
          const currentMetadata = get().metadata;
          const metadata: SemanticCartographerSettingsMetadata = currentMetadata
            ? { ...currentMetadata, record }
            : {
                defaultSettings: nextDraft,
                numberBounds: [],
                record,
                relationships: [],
              };
          emitCartographerAuditRecordingSnapshot(
            createCartographerAuditRecordingSnapshot({
              capturedAt: new Date().toISOString(),
              processingState,
              recentRuns,
              settings: record,
              trigger: "settings_save",
              workspaceId,
            }),
          );
          set({
            dirty: false,
            draft: nextDraft,
            error: null,
            fieldErrors: validateCartographerSettingsDraft(nextDraft, metadata, get().modelOptions),
            metadata,
            processingState,
            recentRuns,
            record,
            selectedWorkspaceId: workspaceId,
            status: "ready",
          });
        } catch (error) {
          if (generation !== refreshGeneration) {
            return;
          }
          set({ error: errorMessage(error), status: "error" });
        }
      },
      selectedWorkspaceId: null,
      setAuditCaptureLevel: (captureLevel) => {
        const draft = get().draft;
        if (!draft) {
          return;
        }
        commitDraft({ ...draft, auditConfig: { captureLevel } });
      },
      setAutomaticProcessingEnabled: (enabled) => {
        const draft = get().draft;
        if (!draft) {
          return;
        }
        commitDraft({ ...draft, automaticProcessingEnabled: enabled });
      },
      setNumberField: (field, value) => {
        const draft = get().draft;
        if (!draft) {
          return;
        }
        commitDraft(settingsInputWithNumberField(draft, field, value));
      },
      setTaskInputBudget: (profile, value) => {
        const draft = get().draft;
        if (!draft) {
          return;
        }
        commitDraft(
          settingsInputWithTaskConfig(draft, profile, (config) => ({
            ...config,
            inputBudget: value,
          })),
        );
      },
      setTaskModelId: (profile, modelId) => {
        const draft = get().draft;
        if (!draft) {
          return;
        }
        const model = get().modelOptions.find((option) => option.model === modelId);
        commitDraft(
          settingsInputWithTaskConfig(draft, profile, (config) => ({
            ...config,
            modelId,
            modelSelection: "explicit",
            reasoningEffort: model?.defaultReasoningEffort ?? config.reasoningEffort,
          })),
        );
      },
      setTaskModelSelection: (profile, modelSelection) => {
        const draft = get().draft;
        if (!draft) {
          return;
        }
        commitDraft(
          settingsInputWithTaskConfig(draft, profile, (config) => {
            if (modelSelection === "provider_default") {
              return { ...config, modelId: "", modelSelection };
            }
            const modelId = config.modelId || get().modelOptions[0]?.model || "";
            const model = get().modelOptions.find((option) => option.model === modelId);
            return {
              ...config,
              modelId,
              modelSelection,
              reasoningEffort: model?.defaultReasoningEffort ?? config.reasoningEffort,
            };
          }),
        );
      },
      setTaskReasoningEffort: (profile, reasoningEffort) => {
        const draft = get().draft;
        if (!draft) {
          return;
        }
        commitDraft(
          settingsInputWithTaskConfig(draft, profile, (config) => ({
            ...config,
            reasoningEffort,
          })),
        );
      },
      status: "idle",
    };
  },
);

export function inputFromRecord(
  record: SemanticCartographerSettingsRecord | null,
): SemanticCartographerSettingsInput | null {
  if (!record) {
    return null;
  }
  return {
    auditConfig: record.settings.auditConfig,
    automaticProcessingEnabled: record.settings.automaticProcessingEnabled,
    finalSynthesisTaskConfig: record.settings.finalSynthesisTaskConfig,
    liveTaskConfig: record.settings.liveTaskConfig,
    observationConfig: record.settings.observationConfig,
    processingConfig: record.settings.processingConfig,
  };
}

function cartographerSettingsInputEqual(
  left: SemanticCartographerSettingsInput | null,
  right: SemanticCartographerSettingsInput | null,
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return JSON.stringify(left) === JSON.stringify(right);
}

export function taskConfigForProfile(
  settings: SemanticCartographerSettingsInput,
  profile: SemanticCartographerTaskProfile,
): SemanticCartographerTaskConfig {
  return profile === "live" ? settings.liveTaskConfig : settings.finalSynthesisTaskConfig;
}

export function defaultCartographerModelOption(
  modelOptions: ChatModelOption[],
): ChatModelOption | null {
  return modelOptions.find((option) => option.isDefault) ?? null;
}

function selectedCartographerModelOption(
  taskConfig: SemanticCartographerTaskConfig,
  modelOptions: ChatModelOption[],
): ChatModelOption | null {
  if (taskConfig.modelSelection === "provider_default") {
    return defaultCartographerModelOption(modelOptions);
  }
  return modelOptions.find((option) => option.model === taskConfig.modelId) ?? null;
}

export function reasoningOptionsForTaskConfig(
  taskConfig: SemanticCartographerTaskConfig,
  modelOptions: ChatModelOption[],
): ChatReasoningEffortOption[] {
  return selectedCartographerModelOption(taskConfig, modelOptions)?.supportedReasoningEfforts ?? [];
}

function validateCartographerSettingsDraft(
  draft: SemanticCartographerSettingsInput | null,
  metadata: SemanticCartographerSettingsMetadata | null,
  modelOptions: ChatModelOption[],
): Record<string, string> {
  if (!draft) {
    return {};
  }
  const errors: Record<string, string> = {};
  validateNumberBounds(draft, metadata, errors);
  validateRelationships(draft, metadata, errors);
  validateTaskConfigs(draft, modelOptions, errors);
  return errors;
}

function validateNumberBounds(
  draft: SemanticCartographerSettingsInput,
  metadata: SemanticCartographerSettingsMetadata | null,
  errors: Record<string, string>,
) {
  for (const bound of metadata?.numberBounds ?? []) {
    const value = numericFieldValue(draft, bound.field);
    if (value === null) {
      errors[bound.field] = "Value is required.";
    } else if (!Number.isFinite(value) || value < bound.min) {
      errors[bound.field] = `Must be at least ${bound.min}.`;
    }
  }
}

function validateRelationships(
  draft: SemanticCartographerSettingsInput,
  metadata: SemanticCartographerSettingsMetadata | null,
  errors: Record<string, string>,
) {
  for (const relationship of metadata?.relationships ?? []) {
    if (relationship.operator !== "lte") {
      errors[relationship.field] = `Unsupported validation relationship: ${relationship.operator}.`;
      continue;
    }
    const left = numericFieldValue(draft, relationship.field);
    const right = numericFieldValue(draft, relationship.comparedField);
    if (left !== null && right !== null && left > right) {
      errors[relationship.field] =
        `Must be less than or equal to ${cartographerFieldLabel(relationship.comparedField)}.`;
    }
  }
}

function validateTaskConfigs(
  draft: SemanticCartographerSettingsInput,
  modelOptions: ChatModelOption[],
  errors: Record<string, string>,
) {
  validateTaskConfig("liveTaskConfig", draft.liveTaskConfig, modelOptions, errors);
  validateTaskConfig(
    "finalSynthesisTaskConfig",
    draft.finalSynthesisTaskConfig,
    modelOptions,
    errors,
  );
}

function validateTaskConfig(
  prefix: "liveTaskConfig" | "finalSynthesisTaskConfig",
  taskConfig: SemanticCartographerTaskConfig,
  modelOptions: ChatModelOption[],
  errors: Record<string, string>,
) {
  if (taskConfig.modelSelection === "explicit" && taskConfig.modelId.trim() === "") {
    errors[`${prefix}.modelId`] = "Select a model.";
    return;
  }
  if (modelOptions.length === 0) {
    return;
  }
  const model = selectedCartographerModelOption(taskConfig, modelOptions);
  if (taskConfig.modelSelection === "explicit" && !model) {
    errors[`${prefix}.modelId`] = "Model is not in the current Codex catalog.";
    return;
  }
  if (!model) {
    return;
  }
  if (
    !model.supportedReasoningEfforts.some((option) => option.effort === taskConfig.reasoningEffort)
  ) {
    errors[`${prefix}.reasoningEffort`] =
      `Reasoning effort is not supported by ${model.displayName || model.model}.`;
  }
}

function settingsInputWithTaskConfig(
  settings: SemanticCartographerSettingsInput,
  profile: SemanticCartographerTaskProfile,
  update: (config: SemanticCartographerTaskConfig) => SemanticCartographerTaskConfig,
): SemanticCartographerSettingsInput {
  if (profile === "live") {
    return { ...settings, liveTaskConfig: update(settings.liveTaskConfig) };
  }
  return { ...settings, finalSynthesisTaskConfig: update(settings.finalSynthesisTaskConfig) };
}

function settingsInputWithNumberField(
  settings: SemanticCartographerSettingsInput,
  field: string,
  value: number,
): SemanticCartographerSettingsInput {
  const next = cloneSettingsInput(settings) as unknown as Record<string, unknown>;
  let target: Record<string, unknown> = next;
  const parts = field.split(".");
  for (const part of parts.slice(0, -1)) {
    const child = target[part];
    if (!isRecord(child)) {
      throw new Error(`unsupported cartographer numeric field ${field}`);
    }
    target = child;
  }
  const finalPart = parts.at(-1);
  if (!finalPart || typeof target[finalPart] !== "number") {
    throw new Error(`unsupported cartographer numeric field ${field}`);
  }
  target[finalPart] = value;
  return next as unknown as SemanticCartographerSettingsInput;
}

function numericFieldValue(
  settings: SemanticCartographerSettingsInput,
  field: string,
): number | null {
  let value: unknown = settings;
  for (const part of field.split(".")) {
    if (!isRecord(value)) {
      return null;
    }
    value = value[part];
  }
  return typeof value === "number" ? value : null;
}

function cloneSettingsInput(
  settings: SemanticCartographerSettingsInput,
): SemanticCartographerSettingsInput {
  return JSON.parse(JSON.stringify(settings)) as SemanticCartographerSettingsInput;
}

function selectedWorkspaceIdFromWorkspaceStore(): string | null {
  const selectedWorkspaceId = useWorkspaceStore.getState().session?.selectedWorkspaceId ?? "";
  return selectedWorkspaceId === "" ? null : selectedWorkspaceId;
}

function cartographerFieldLabel(field: string): string {
  switch (field) {
    case "processingConfig.maxConcurrent":
      return "max concurrent";
    case "observationConfig.maxWindowContentBytes":
      return "max window content bytes";
    default:
      return field;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Cartographer settings request failed";
}
