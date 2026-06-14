import type {
  CartographerProcessingState,
  CartographerRun,
  ChatModelOption,
  ReasoningEffort,
  SemanticCartographerAuditCaptureLevel,
  SemanticCartographerSettingsInput,
  SemanticCartographerSettingsMetadata,
} from "@generated/backend";
import { semanticCartographerAuditCaptureLevelValues } from "@generated/backend";
import { Loader2, Map, RefreshCw, RotateCcw, Save, SlidersHorizontal } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";

import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  CartographerRuntimeSummary,
  CartographerSettingsStatus,
} from "./semantic-cartographer-settings-summary";
import { cn } from "../lib/utils";
import {
  defaultCartographerModelOption,
  reasoningOptionsForTaskConfig,
  taskConfigForProfile,
  type SemanticCartographerSettingsStatus,
  type SemanticCartographerTaskProfile,
  useSemanticCartographerSettingsStore,
} from "../stores/semantic-cartographer-settings-store";
import { useWorkspaceStore } from "../stores/workspace-store";

export function SemanticCartographerSettingsPanel() {
  const selectedWorkspaceId = useWorkspaceStore(
    (state) => state.session?.selectedWorkspaceId ?? "",
  );
  const dirty = useSemanticCartographerSettingsStore((state) => state.dirty);
  const draft = useSemanticCartographerSettingsStore((state) => state.draft);
  const error = useSemanticCartographerSettingsStore((state) => state.error);
  const fieldErrors = useSemanticCartographerSettingsStore((state) => state.fieldErrors);
  const metadata = useSemanticCartographerSettingsStore((state) => state.metadata);
  const modelOptions = useSemanticCartographerSettingsStore((state) => state.modelOptions);
  const processingState = useSemanticCartographerSettingsStore((state) => state.processingState);
  const recentRuns = useSemanticCartographerSettingsStore((state) => state.recentRuns);
  const refresh = useSemanticCartographerSettingsStore((state) => state.refresh);
  const resetDraftToDefaults = useSemanticCartographerSettingsStore(
    (state) => state.resetDraftToDefaults,
  );
  const revertDraft = useSemanticCartographerSettingsStore((state) => state.revertDraft);
  const saveDraft = useSemanticCartographerSettingsStore((state) => state.saveDraft);
  const setAuditCaptureLevel = useSemanticCartographerSettingsStore(
    (state) => state.setAuditCaptureLevel,
  );
  const setAutomaticProcessingEnabled = useSemanticCartographerSettingsStore(
    (state) => state.setAutomaticProcessingEnabled,
  );
  const setNumberField = useSemanticCartographerSettingsStore((state) => state.setNumberField);
  const setTaskInputBudget = useSemanticCartographerSettingsStore(
    (state) => state.setTaskInputBudget,
  );
  const setTaskModelId = useSemanticCartographerSettingsStore((state) => state.setTaskModelId);
  const setTaskModelSelection = useSemanticCartographerSettingsStore(
    (state) => state.setTaskModelSelection,
  );
  const setTaskReasoningEffort = useSemanticCartographerSettingsStore(
    (state) => state.setTaskReasoningEffort,
  );
  const status = useSemanticCartographerSettingsStore((state) => state.status);

  useEffect(() => {
    void refresh();
  }, [refresh, selectedWorkspaceId]);

  return (
    <SemanticCartographerSettingsEditor
      dirty={dirty}
      draft={draft}
      error={error}
      fieldErrors={fieldErrors}
      metadata={metadata}
      modelOptions={modelOptions}
      onAuditCaptureLevelChange={setAuditCaptureLevel}
      onAutomaticProcessingEnabledChange={setAutomaticProcessingEnabled}
      onNumberFieldChange={setNumberField}
      onRefresh={refresh}
      onReset={resetDraftToDefaults}
      onRevert={revertDraft}
      onSave={saveDraft}
      onTaskInputBudgetChange={setTaskInputBudget}
      onTaskModelIdChange={setTaskModelId}
      onTaskModelSelectionChange={setTaskModelSelection}
      onTaskReasoningEffortChange={setTaskReasoningEffort}
      processingState={processingState}
      recentRuns={recentRuns}
      selectedWorkspaceId={selectedWorkspaceId}
      status={status}
    />
  );
}

interface SemanticCartographerSettingsEditorProps {
  dirty: boolean;
  draft: SemanticCartographerSettingsInput | null;
  error: string | null;
  fieldErrors: Record<string, string>;
  metadata: SemanticCartographerSettingsMetadata | null;
  modelOptions: ChatModelOption[];
  onAuditCaptureLevelChange: (captureLevel: SemanticCartographerAuditCaptureLevel) => void;
  onAutomaticProcessingEnabledChange: (enabled: boolean) => void;
  onNumberFieldChange: (field: string, value: number) => void;
  onRefresh: () => Promise<void>;
  onReset: () => void;
  onRevert: () => void;
  onSave: () => Promise<void>;
  onTaskInputBudgetChange: (profile: SemanticCartographerTaskProfile, value: number) => void;
  onTaskModelIdChange: (profile: SemanticCartographerTaskProfile, modelId: string) => void;
  onTaskModelSelectionChange: (
    profile: SemanticCartographerTaskProfile,
    modelSelection: "provider_default" | "explicit",
  ) => void;
  onTaskReasoningEffortChange: (
    profile: SemanticCartographerTaskProfile,
    reasoningEffort: ReasoningEffort,
  ) => void;
  processingState: CartographerProcessingState | null;
  recentRuns: CartographerRun[];
  selectedWorkspaceId: string;
  status: SemanticCartographerSettingsStatus;
}

export function SemanticCartographerSettingsEditor({
  dirty,
  draft,
  error,
  fieldErrors,
  metadata,
  modelOptions,
  onAuditCaptureLevelChange,
  onAutomaticProcessingEnabledChange,
  onNumberFieldChange,
  onRefresh,
  onReset,
  onRevert,
  onSave,
  onTaskInputBudgetChange,
  onTaskModelIdChange,
  onTaskModelSelectionChange,
  onTaskReasoningEffortChange,
  processingState,
  recentRuns,
  selectedWorkspaceId,
  status,
}: SemanticCartographerSettingsEditorProps) {
  const [activeProfile, setActiveProfile] = useState<SemanticCartographerTaskProfile>("live");
  const editorState = cartographerEditorState({ fieldErrors, selectedWorkspaceId, status });

  return (
    <form
      className="grid gap-3"
      data-testid="semantic-cartographer-settings"
      onSubmit={(event) => submitCartographerSettings(event, { dirty, editorState, onSave })}
    >
      <CartographerSettingsHeader
        dirty={dirty}
        draftAvailable={draft !== null}
        editorState={editorState}
        error={error}
        fieldErrors={fieldErrors}
        onRefresh={onRefresh}
        onReset={onReset}
        onRevert={onRevert}
        status={status}
      />
      <CartographerSettingsBody
        activeProfile={activeProfile}
        draft={draft}
        editorState={editorState}
        fieldErrors={fieldErrors}
        metadata={metadata}
        modelOptions={modelOptions}
        onActiveProfileChange={setActiveProfile}
        onAuditCaptureLevelChange={onAuditCaptureLevelChange}
        onAutomaticProcessingEnabledChange={onAutomaticProcessingEnabledChange}
        onNumberFieldChange={onNumberFieldChange}
        onTaskInputBudgetChange={onTaskInputBudgetChange}
        onTaskModelIdChange={onTaskModelIdChange}
        onTaskModelSelectionChange={onTaskModelSelectionChange}
        onTaskReasoningEffortChange={onTaskReasoningEffortChange}
        processingState={processingState}
        recentRuns={recentRuns}
      />
    </form>
  );
}

interface CartographerEditorState {
  busy: boolean;
  hasFieldErrors: boolean;
  readOnly: boolean;
  workspaceReady: boolean;
}

function cartographerEditorState({
  fieldErrors,
  selectedWorkspaceId,
  status,
}: {
  fieldErrors: Record<string, string>;
  selectedWorkspaceId: string;
  status: SemanticCartographerSettingsStatus;
}): CartographerEditorState {
  const busy = status === "loading" || status === "saving";
  const workspaceReady = selectedWorkspaceId !== "";
  return {
    busy,
    hasFieldErrors: Object.keys(fieldErrors).length > 0,
    readOnly: busy || !workspaceReady,
    workspaceReady,
  };
}

function submitCartographerSettings(
  event: FormEvent<HTMLFormElement>,
  {
    dirty,
    editorState,
    onSave,
  }: {
    dirty: boolean;
    editorState: CartographerEditorState;
    onSave: () => Promise<void>;
  },
) {
  event.preventDefault();
  if (canSubmitCartographerSettings(dirty, editorState)) {
    void onSave();
  }
}

function canSubmitCartographerSettings(
  dirty: boolean,
  editorState: CartographerEditorState,
): boolean {
  return dirty && !editorState.readOnly && !editorState.hasFieldErrors;
}

function CartographerSettingsHeader({
  dirty,
  draftAvailable,
  editorState,
  error,
  fieldErrors,
  onRefresh,
  onReset,
  onRevert,
  status,
}: {
  dirty: boolean;
  draftAvailable: boolean;
  editorState: CartographerEditorState;
  error: string | null;
  fieldErrors: Record<string, string>;
  onRefresh: () => Promise<void>;
  onReset: () => void;
  onRevert: () => void;
  status: SemanticCartographerSettingsStatus;
}) {
  return (
    <header className="grid gap-2">
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Map className="h-4 w-4 shrink-0 text-muted-foreground" />
          <h2 className="truncate text-xs font-semibold tracking-wide text-foreground">
            Cartographer
          </h2>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
          <Button disabled={editorState.busy} onClick={() => void onRefresh()} type="button">
            <RefreshCw className={cn("h-3.5 w-3.5", status === "loading" && "animate-spin")} />
            Refresh
          </Button>
          <Button disabled={!draftAvailable || editorState.busy} onClick={onReset} type="button">
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </Button>
          <Button disabled={!dirty || editorState.busy} onClick={onRevert} type="button">
            <RotateCcw className="h-3.5 w-3.5" />
            Revert
          </Button>
          <Button
            data-testid="cartographer-settings-save-button"
            disabled={!draftAvailable || !canSubmitCartographerSettings(dirty, editorState)}
            type="submit"
            variant="primary"
          >
            <SaveButtonIcon status={status} />
            Save
          </Button>
        </div>
      </div>
      <CartographerSettingsStatus
        dirty={dirty}
        error={error}
        fieldErrors={fieldErrors}
        status={status}
        workspaceReady={editorState.workspaceReady}
      />
    </header>
  );
}

function SaveButtonIcon({ status }: { status: SemanticCartographerSettingsStatus }) {
  if (status === "saving") {
    return <Loader2 className="h-3.5 w-3.5 animate-spin" />;
  }
  return <Save className="h-3.5 w-3.5" />;
}

function CartographerSettingsBody({
  activeProfile,
  draft,
  editorState,
  fieldErrors,
  metadata,
  modelOptions,
  onActiveProfileChange,
  onAuditCaptureLevelChange,
  onAutomaticProcessingEnabledChange,
  onNumberFieldChange,
  onTaskInputBudgetChange,
  onTaskModelIdChange,
  onTaskModelSelectionChange,
  onTaskReasoningEffortChange,
  processingState,
  recentRuns,
}: {
  activeProfile: SemanticCartographerTaskProfile;
  draft: SemanticCartographerSettingsInput | null;
  editorState: CartographerEditorState;
  fieldErrors: Record<string, string>;
  metadata: SemanticCartographerSettingsMetadata | null;
  modelOptions: ChatModelOption[];
  onActiveProfileChange: (profile: SemanticCartographerTaskProfile) => void;
  onAuditCaptureLevelChange: (captureLevel: SemanticCartographerAuditCaptureLevel) => void;
  onAutomaticProcessingEnabledChange: (enabled: boolean) => void;
  onNumberFieldChange: (field: string, value: number) => void;
  onTaskInputBudgetChange: (profile: SemanticCartographerTaskProfile, value: number) => void;
  onTaskModelIdChange: (profile: SemanticCartographerTaskProfile, modelId: string) => void;
  onTaskModelSelectionChange: (
    profile: SemanticCartographerTaskProfile,
    modelSelection: "provider_default" | "explicit",
  ) => void;
  onTaskReasoningEffortChange: (
    profile: SemanticCartographerTaskProfile,
    reasoningEffort: ReasoningEffort,
  ) => void;
  processingState: CartographerProcessingState | null;
  recentRuns: CartographerRun[];
}) {
  if (!draft) {
    return <CartographerSettingsLoading />;
  }
  return (
    <>
      <section className="grid gap-3 rounded-sm border border-border bg-card/30 px-3 py-2.5">
        <CartographerToggle
          checked={draft.automaticProcessingEnabled}
          disabled={editorState.readOnly}
          label="Automatic processing"
          onChange={onAutomaticProcessingEnabledChange}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-2">
          <div className="flex min-w-0 items-center gap-2">
            <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
            <h3 className="truncate text-xs font-semibold text-foreground">Task profile</h3>
          </div>
          <SegmentedControl
            disabled={editorState.busy}
            onChange={onActiveProfileChange}
            options={[
              { label: "Live", value: "live" },
              { label: "Final", value: "final" },
            ]}
            value={activeProfile}
          />
        </div>
        <TaskProfileSettings
          disabled={editorState.readOnly}
          fieldErrors={fieldErrors}
          metadata={metadata}
          modelOptions={modelOptions}
          onInputBudgetChange={onTaskInputBudgetChange}
          onModelIdChange={onTaskModelIdChange}
          onModelSelectionChange={onTaskModelSelectionChange}
          onReasoningEffortChange={onTaskReasoningEffortChange}
          profile={activeProfile}
          settings={draft}
        />
      </section>

      <ProcessingSettingsSection
        draft={draft}
        fieldErrors={fieldErrors}
        metadata={metadata}
        onNumberFieldChange={onNumberFieldChange}
        readOnly={editorState.readOnly}
      />
      <ObservationSettingsSection
        draft={draft}
        fieldErrors={fieldErrors}
        metadata={metadata}
        onNumberFieldChange={onNumberFieldChange}
        readOnly={editorState.readOnly}
      />
      <AuditSettingsSection
        captureLevel={draft.auditConfig.captureLevel}
        onAuditCaptureLevelChange={onAuditCaptureLevelChange}
        readOnly={editorState.readOnly}
      />
      <CartographerRuntimeSummary processingState={processingState} recentRuns={recentRuns} />
    </>
  );
}

function CartographerSettingsLoading() {
  return (
    <div className="flex h-16 items-center gap-2 rounded-sm border border-border px-3 text-xs text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      Loading cartographer settings
    </div>
  );
}

function ProcessingSettingsSection({
  draft,
  fieldErrors,
  metadata,
  onNumberFieldChange,
  readOnly,
}: {
  draft: SemanticCartographerSettingsInput;
  fieldErrors: Record<string, string>;
  metadata: SemanticCartographerSettingsMetadata | null;
  onNumberFieldChange: (field: string, value: number) => void;
  readOnly: boolean;
}) {
  return (
    <section className="grid gap-2 rounded-sm border border-border bg-card/30 px-3 py-2.5">
      <h3 className="text-xs font-semibold text-foreground">Processing</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        <NumberField
          disabled={readOnly}
          error={fieldErrors["processingConfig.maxConcurrent"]}
          field="processingConfig.maxConcurrent"
          label="Max concurrent"
          metadata={metadata}
          onChange={onNumberFieldChange}
          value={draft.processingConfig.maxConcurrent}
        />
        <NumberField
          disabled={readOnly}
          error={fieldErrors["processingConfig.perSourceConcurrent"]}
          field="processingConfig.perSourceConcurrent"
          label="Per-source concurrent"
          metadata={metadata}
          onChange={onNumberFieldChange}
          value={draft.processingConfig.perSourceConcurrent}
        />
        <NumberField
          disabled={readOnly}
          error={fieldErrors["processingConfig.maxQueuedPerSource"]}
          field="processingConfig.maxQueuedPerSource"
          label="Queue cap per source"
          metadata={metadata}
          onChange={onNumberFieldChange}
          value={draft.processingConfig.maxQueuedPerSource}
        />
        <NumberField
          disabled={readOnly}
          error={fieldErrors["processingConfig.leaseDurationSeconds"]}
          field="processingConfig.leaseDurationSeconds"
          label="Lease seconds"
          metadata={metadata}
          onChange={onNumberFieldChange}
          value={draft.processingConfig.leaseDurationSeconds}
        />
      </div>
    </section>
  );
}

function ObservationSettingsSection({
  draft,
  fieldErrors,
  metadata,
  onNumberFieldChange,
  readOnly,
}: {
  draft: SemanticCartographerSettingsInput;
  fieldErrors: Record<string, string>;
  metadata: SemanticCartographerSettingsMetadata | null;
  onNumberFieldChange: (field: string, value: number) => void;
  readOnly: boolean;
}) {
  return (
    <section className="grid gap-2 rounded-sm border border-border bg-card/30 px-3 py-2.5">
      <h3 className="text-xs font-semibold text-foreground">Observation</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        <NumberField
          disabled={readOnly}
          error={fieldErrors["observationConfig.maxWindowEvents"]}
          field="observationConfig.maxWindowEvents"
          label="Max window events"
          metadata={metadata}
          onChange={onNumberFieldChange}
          value={draft.observationConfig.maxWindowEvents}
        />
        <NumberField
          disabled={readOnly}
          error={fieldErrors["observationConfig.maxWindowContentBytes"]}
          field="observationConfig.maxWindowContentBytes"
          label="Max window bytes"
          metadata={metadata}
          onChange={onNumberFieldChange}
          value={draft.observationConfig.maxWindowContentBytes}
        />
        <NumberField
          disabled={readOnly}
          error={fieldErrors["observationConfig.assistantThresholdBytes"]}
          field="observationConfig.assistantThresholdBytes"
          label="Assistant threshold bytes"
          metadata={metadata}
          onChange={onNumberFieldChange}
          value={draft.observationConfig.assistantThresholdBytes}
        />
        <NumberField
          disabled={readOnly}
          error={fieldErrors["observationConfig.outputThresholdBytes"]}
          field="observationConfig.outputThresholdBytes"
          label="Output threshold bytes"
          metadata={metadata}
          onChange={onNumberFieldChange}
          value={draft.observationConfig.outputThresholdBytes}
        />
        <NumberField
          disabled={readOnly}
          error={fieldErrors["observationConfig.priorSummaryLimit"]}
          field="observationConfig.priorSummaryLimit"
          label="Prior summary limit"
          metadata={metadata}
          onChange={onNumberFieldChange}
          value={draft.observationConfig.priorSummaryLimit}
        />
        <NumberField
          disabled={readOnly}
          error={fieldErrors["observationConfig.tokenBudget"]}
          field="observationConfig.tokenBudget"
          label="Token budget"
          metadata={metadata}
          onChange={onNumberFieldChange}
          value={draft.observationConfig.tokenBudget}
        />
        <NumberField
          disabled={readOnly}
          error={fieldErrors["observationConfig.quietCloseAfterSeconds"]}
          field="observationConfig.quietCloseAfterSeconds"
          label="Quiet close seconds"
          metadata={metadata}
          onChange={onNumberFieldChange}
          value={draft.observationConfig.quietCloseAfterSeconds}
        />
      </div>
    </section>
  );
}

function AuditSettingsSection({
  captureLevel,
  onAuditCaptureLevelChange,
  readOnly,
}: {
  captureLevel: SemanticCartographerAuditCaptureLevel;
  onAuditCaptureLevelChange: (captureLevel: SemanticCartographerAuditCaptureLevel) => void;
  readOnly: boolean;
}) {
  return (
    <section className="grid gap-2 rounded-sm border border-border bg-card/30 px-3 py-2.5">
      <h3 className="text-xs font-semibold text-foreground">Audit</h3>
      <label className="grid gap-1">
        <span className="text-xs font-medium text-foreground">Capture level</span>
        <select
          className={selectClassName}
          disabled={readOnly}
          onChange={(event) =>
            onAuditCaptureLevelChange(
              event.currentTarget.value as SemanticCartographerAuditCaptureLevel,
            )
          }
          value={captureLevel}
        >
          {semanticCartographerAuditCaptureLevelValues.map((level) => (
            <option key={level} value={level}>
              {auditCaptureLevelLabel(level)}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}

interface TaskProfileSettingsProps {
  disabled: boolean;
  fieldErrors: Record<string, string>;
  metadata: SemanticCartographerSettingsMetadata | null;
  modelOptions: ChatModelOption[];
  onInputBudgetChange: (profile: SemanticCartographerTaskProfile, value: number) => void;
  onModelIdChange: (profile: SemanticCartographerTaskProfile, modelId: string) => void;
  onModelSelectionChange: (
    profile: SemanticCartographerTaskProfile,
    modelSelection: "provider_default" | "explicit",
  ) => void;
  onReasoningEffortChange: (
    profile: SemanticCartographerTaskProfile,
    reasoningEffort: ReasoningEffort,
  ) => void;
  profile: SemanticCartographerTaskProfile;
  settings: SemanticCartographerSettingsInput;
}

function TaskProfileSettings({
  disabled,
  fieldErrors,
  metadata,
  modelOptions,
  onInputBudgetChange,
  onModelIdChange,
  onModelSelectionChange,
  onReasoningEffortChange,
  profile,
  settings,
}: TaskProfileSettingsProps) {
  const config = taskConfigForProfile(settings, profile);
  const prefix = taskProfileFieldPrefix(profile);

  return (
    <div className="grid gap-2">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(11rem,14rem)]">
        <label className="grid gap-1">
          <span className="text-xs font-medium text-foreground">Model mode</span>
          <SegmentedControl
            disabled={disabled}
            onChange={(value) => onModelSelectionChange(profile, value)}
            options={[
              { label: "Provider default", value: "provider_default" },
              { label: "Explicit model", value: "explicit" },
            ]}
            value={config.modelSelection}
          />
        </label>
        <NumberField
          disabled={disabled}
          error={fieldErrors[`${prefix}.inputBudget`]}
          field={`${prefix}.inputBudget`}
          label="Input budget"
          metadata={metadata}
          onChange={(_field, value) => onInputBudgetChange(profile, value)}
          value={config.inputBudget}
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <TaskModelSelect
          config={config}
          disabled={disabled}
          error={fieldErrors[`${prefix}.modelId`]}
          modelOptions={modelOptions}
          onModelIdChange={(modelId) => onModelIdChange(profile, modelId)}
        />
        <TaskReasoningSelect
          config={config}
          disabled={disabled}
          error={fieldErrors[`${prefix}.reasoningEffort`]}
          modelOptions={modelOptions}
          onReasoningEffortChange={(reasoningEffort) =>
            onReasoningEffortChange(profile, reasoningEffort)
          }
        />
      </div>
    </div>
  );
}

function taskProfileFieldPrefix(profile: SemanticCartographerTaskProfile) {
  return profile === "live" ? "liveTaskConfig" : "finalSynthesisTaskConfig";
}

function TaskModelSelect({
  config,
  disabled,
  error,
  modelOptions,
  onModelIdChange,
}: {
  config: ReturnType<typeof taskConfigForProfile>;
  disabled: boolean;
  error: string | undefined;
  modelOptions: ChatModelOption[];
  onModelIdChange: (modelId: string) => void;
}) {
  const defaultModel = defaultCartographerModelOption(modelOptions);
  return (
    <label className="grid gap-1">
      <span className="flex items-center justify-between gap-2 text-xs font-medium text-foreground">
        <span>Model</span>
        <DefaultModelLabel option={defaultModel} />
      </span>
      <select
        className={selectClassName}
        disabled={disabled || config.modelSelection !== "explicit"}
        onChange={(event) => onModelIdChange(event.currentTarget.value)}
        value={config.modelId}
      >
        <UnsupportedModelOption config={config} modelOptions={modelOptions} />
        {modelOptions.map((option) => (
          <option key={option.model} value={option.model}>
            {modelOptionLabel(option)}
          </option>
        ))}
      </select>
      <FieldError message={error} />
    </label>
  );
}

function DefaultModelLabel({ option }: { option: ChatModelOption | null }) {
  if (!option) {
    return null;
  }
  return (
    <span className="min-w-0 truncate text-[11px] font-normal text-muted-foreground">
      Default: {option.displayName || option.model}
    </span>
  );
}

function UnsupportedModelOption({
  config,
  modelOptions,
}: {
  config: ReturnType<typeof taskConfigForProfile>;
  modelOptions: ChatModelOption[];
}) {
  if (hasCurrentModelOption(config, modelOptions)) {
    return null;
  }
  return <option value={config.modelId}>Unsupported: {config.modelId}</option>;
}

function hasCurrentModelOption(
  config: ReturnType<typeof taskConfigForProfile>,
  modelOptions: ChatModelOption[],
) {
  return (
    modelOptions.length === 0 ||
    config.modelId === "" ||
    modelOptions.some((option) => option.model === config.modelId)
  );
}

function TaskReasoningSelect({
  config,
  disabled,
  error,
  modelOptions,
  onReasoningEffortChange,
}: {
  config: ReturnType<typeof taskConfigForProfile>;
  disabled: boolean;
  error: string | undefined;
  modelOptions: ChatModelOption[];
  onReasoningEffortChange: (reasoningEffort: ReasoningEffort) => void;
}) {
  const reasoningOptions = reasoningOptionsForTaskConfig(config, modelOptions);
  return (
    <label className="grid gap-1">
      <span className="text-xs font-medium text-foreground">Reasoning effort</span>
      <select
        className={selectClassName}
        disabled={disabled || reasoningOptions.length === 0}
        onChange={(event) => onReasoningEffortChange(event.currentTarget.value as ReasoningEffort)}
        value={config.reasoningEffort}
      >
        <UnsupportedReasoningOption
          config={config}
          modelOptions={modelOptions}
          reasoningOptions={reasoningOptions}
        />
        {reasoningOptions.map((option) => (
          <option key={option.effort} value={option.effort}>
            {option.displayName || option.effort}
          </option>
        ))}
      </select>
      <FieldError message={error} />
    </label>
  );
}

function UnsupportedReasoningOption({
  config,
  modelOptions,
  reasoningOptions,
}: {
  config: ReturnType<typeof taskConfigForProfile>;
  modelOptions: ChatModelOption[];
  reasoningOptions: ReturnType<typeof reasoningOptionsForTaskConfig>;
}) {
  if (
    modelOptions.length === 0 ||
    reasoningOptions.some((option) => option.effort === config.reasoningEffort)
  ) {
    return null;
  }
  return <option value={config.reasoningEffort}>Unsupported: {config.reasoningEffort}</option>;
}

function NumberField({
  disabled,
  error,
  field,
  label,
  metadata,
  onChange,
  value,
}: {
  disabled: boolean;
  error: string | undefined;
  field: string;
  label: string;
  metadata: SemanticCartographerSettingsMetadata | null;
  onChange: (field: string, value: number) => void;
  value: number;
}) {
  const min = metadata?.numberBounds.find((bound) => bound.field === field)?.min;
  return (
    <label className="grid gap-1">
      <span className="text-xs font-medium text-foreground">{label}</span>
      <Input
        data-testid={`cartographer-number-${field.replaceAll(".", "-")}`}
        disabled={disabled}
        inputMode="numeric"
        min={min}
        onChange={(event) => {
          const next = Number.parseInt(event.currentTarget.value, 10);
          if (Number.isFinite(next)) {
            onChange(field, next);
          }
        }}
        step={1}
        type="number"
        value={value}
      />
      <FieldError message={error} />
    </label>
  );
}

function CartographerToggle({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-10 items-center justify-between gap-3">
      <span className="min-w-0 text-xs font-medium text-foreground">{label}</span>
      <span className="relative inline-flex h-6 w-10 shrink-0 items-center">
        <input
          checked={checked}
          className="peer sr-only"
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.checked)}
          type="checkbox"
        />
        <span className="h-5 w-9 rounded-full border border-border bg-muted transition-colors peer-checked:border-primary peer-checked:bg-primary peer-disabled:opacity-50" />
        <span className="pointer-events-none absolute left-0.5 h-4 w-4 rounded-full bg-foreground/80 transition-transform peer-checked:translate-x-4 peer-checked:bg-primary-foreground" />
      </span>
    </label>
  );
}

function SegmentedControl<Value extends string>({
  disabled,
  onChange,
  options,
  value,
}: {
  disabled: boolean;
  onChange: (value: Value) => void;
  options: Array<{ label: string; value: Value }>;
  value: Value;
}) {
  return (
    <div className="inline-flex w-fit max-w-full items-center gap-1 rounded-sm bg-muted p-1">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            aria-pressed={active}
            className={cn(
              "h-6 rounded-sm px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50",
              active && "bg-card text-card-foreground shadow-sm",
            )}
            disabled={disabled}
            key={option.value}
            onClick={() => onChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function FieldError({ message }: { message: string | undefined }) {
  return message ? <span className="text-[11px] text-status-critical">{message}</span> : null;
}

function modelOptionLabel(option: ChatModelOption) {
  if (option.displayName && option.displayName !== option.model) {
    return `${option.displayName} (${option.model})`;
  }
  return option.model;
}

function auditCaptureLevelLabel(captureLevel: SemanticCartographerAuditCaptureLevel) {
  switch (captureLevel) {
    case "minimal":
      return "Minimal";
    case "standard":
      return "Standard";
    case "debug":
      return "Debug";
  }
}

const selectClassName =
  "flex h-7 w-full rounded-sm border border-input bg-card px-2 py-1 text-xs text-foreground shadow-sm outline-none transition-colors focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50";
