import type {
  ChatCodexDefaultsView,
  ChatCodexSettings,
  ChatModelOption,
  ChatPermissionPreset,
  ChatPermissionPresetID,
  ChatReasoningEffortOption,
  ReasoningEffort,
} from "@generated/backend";
import { Bot, Check, CircleAlert, Loader2, RotateCcw, Save, ShieldAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "./ui/button";
import { cn } from "../lib/utils";
import {
  chatCodexSettingsEqual,
  type ChatDefaultsStoreStatus,
  useChatDefaultsStore,
} from "../stores/chat-defaults-store";

const selectClassName =
  "h-8 min-w-0 rounded-sm border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-primary";
export function ChatDefaultsSettings() {
  const draft = useChatDefaultsStore((state) => state.draft);
  const error = useChatDefaultsStore((state) => state.error);
  const load = useChatDefaultsStore((state) => state.load);
  const revertDraft = useChatDefaultsStore((state) => state.revertDraft);
  const saveDraft = useChatDefaultsStore((state) => state.saveDraft);
  const setModel = useChatDefaultsStore((state) => state.setModel);
  const setPermissionPreset = useChatDefaultsStore((state) => state.setPermissionPreset);
  const setReasoningEffort = useChatDefaultsStore((state) => state.setReasoningEffort);
  const status = useChatDefaultsStore((state) => state.status);
  const view = useChatDefaultsStore((state) => state.view);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ChatDefaultsSettingsView
      dirty={chatDefaultsDirty(draft, view)}
      draftModel={draftModel(draft)}
      draftPermissionPreset={draftPermissionPreset(draft)}
      draftReasoningEffort={draftReasoningEffort(draft)}
      error={error}
      models={chatDefaultsModels(view)}
      onModelChange={setModel}
      onPermissionPresetChange={setPermissionPreset}
      onReasoningEffortChange={setReasoningEffort}
      onRevert={revertDraft}
      onSave={saveDraft}
      permissionPresets={chatDefaultsPermissionPresets(view)}
      reasoningEfforts={chatDefaultsReasoningEfforts(view, draft)}
      status={status}
    />
  );
}

function chatDefaultsDirty(draft: ChatCodexSettings | null, view: ChatCodexDefaultsView | null) {
  return draft !== null && !chatCodexSettingsEqual(draft, view?.settings ?? null);
}

function draftModel(draft: ChatCodexSettings | null) {
  return draft?.model ?? "";
}

function draftPermissionPreset(draft: ChatCodexSettings | null) {
  return draft?.permission?.preset ?? null;
}

function draftReasoningEffort(draft: ChatCodexSettings | null) {
  return draft?.reasoningEffort ?? null;
}

function chatDefaultsModels(view: ChatCodexDefaultsView | null) {
  return view?.models ?? [];
}

function chatDefaultsPermissionPresets(view: ChatCodexDefaultsView | null) {
  return view?.permissionPresets ?? [];
}

function chatDefaultsReasoningEfforts(
  view: ChatCodexDefaultsView | null,
  draft: ChatCodexSettings | null,
) {
  return reasoningEffortsForDraft(chatDefaultsModels(view), draftModel(draft));
}

function ChatDefaultsSettingsView({
  dirty,
  draftModel,
  draftPermissionPreset,
  draftReasoningEffort,
  error,
  models,
  onModelChange,
  onPermissionPresetChange,
  onReasoningEffortChange,
  onRevert,
  onSave,
  permissionPresets,
  reasoningEfforts,
  status,
}: ChatDefaultsSettingsViewProps) {
  const [confirmPreset, setConfirmPreset] = useState<ChatPermissionPreset | null>(null);
  const permissionEscalationConfirmedRef = useRef(false);
  const busy = status === "loading" || status === "saving";

  function setPermissionEscalationConfirmed(confirmed: boolean) {
    permissionEscalationConfirmedRef.current = confirmed;
  }

  function requestPermissionChange(preset: ChatPermissionPreset) {
    if (preset.disabled) {
      return;
    }
    if (preset.danger?.requiresConfirmation && preset.id !== draftPermissionPreset) {
      setConfirmPreset(preset);
      return;
    }
    if (!preset.danger?.requiresConfirmation) {
      setPermissionEscalationConfirmed(false);
    }
    onPermissionPresetChange(preset.id);
  }

  return (
    <form
      className="grid gap-3"
      data-testid="chat-defaults-settings"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave({
          confirmed: permissionEscalationConfirmedRef.current,
        });
      }}
    >
      <header className="flex min-h-8 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
          <h2 className="truncate text-xs font-semibold tracking-wide text-foreground">
            Chat Defaults
          </h2>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
          <Button disabled={!dirty || busy} onClick={onRevert} type="button">
            <RotateCcw className="h-3.5 w-3.5" />
            Revert
          </Button>
          <Button disabled={!dirty || busy} type="submit" variant="primary">
            {status === "saving" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save
          </Button>
        </div>
      </header>
      <ChatDefaultsStatus dirty={dirty} error={error} status={status} />
      <section className="grid gap-3 rounded-sm border border-border bg-card/30 px-3 py-2.5">
        <div className="grid gap-2 sm:grid-cols-2">
          <ChatDefaultSelect
            label="Model"
            onChange={onModelChange}
            options={modelSelectOptions(models)}
            testId="chat-default-model-select"
            value={draftModel}
          />
          <ChatDefaultSelect
            disabled={!draftModel}
            label="Reasoning"
            onChange={(value) => onReasoningEffortChange(value ? (value as ReasoningEffort) : null)}
            options={reasoningSelectOptions(reasoningEfforts)}
            testId="chat-default-reasoning-select"
            value={draftReasoningEffort ?? ""}
          />
        </div>
        <fieldset className="grid gap-1.5">
          <legend className="text-xs font-medium text-foreground">Permission</legend>
          <div className="grid gap-1.5 sm:grid-cols-3" data-testid="chat-default-permission-group">
            {permissionPresets.map((preset) => {
              const selected = preset.id === draftPermissionPreset;
              return (
                <button
                  aria-pressed={selected}
                  className={cn(
                    "flex min-h-12 min-w-0 flex-col items-start justify-center rounded-sm border px-2 py-1.5 text-left text-xs outline-none transition-colors focus-visible:border-primary",
                    selected
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-background text-muted-foreground hover:text-foreground",
                    preset.disabled && "cursor-not-allowed opacity-50",
                  )}
                  data-permission-preset={preset.id}
                  disabled={preset.disabled}
                  key={preset.id}
                  onClick={() => requestPermissionChange(preset)}
                  title={preset.disabled ? preset.disabledReason : preset.label}
                  type="button"
                >
                  <span className="truncate font-medium">{preset.label}</span>
                  <span className="text-[11px] leading-4">{preset.shortDescription}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      </section>
      {confirmPreset ? (
        <PermissionEscalationConfirmation
          onCancel={() => setConfirmPreset(null)}
          onConfirm={() => {
            onPermissionPresetChange(confirmPreset.id);
            setPermissionEscalationConfirmed(true);
            setConfirmPreset(null);
          }}
          preset={confirmPreset}
        />
      ) : null}
    </form>
  );
}

interface ChatDefaultsSettingsViewProps {
  dirty: boolean;
  draftModel: string;
  draftPermissionPreset: ChatPermissionPresetID | null;
  draftReasoningEffort: ReasoningEffort | null;
  error: string | null;
  models: ChatModelOption[];
  onModelChange: (model: string) => void;
  onPermissionPresetChange: (preset: ChatPermissionPresetID) => void;
  onReasoningEffortChange: (effort: ReasoningEffort | null) => void;
  onRevert: () => void;
  onSave: (options?: { confirmed?: boolean }) => Promise<void>;
  permissionPresets: ChatPermissionPreset[];
  reasoningEfforts: ChatReasoningEffortOption[];
  status: ChatDefaultsStoreStatus;
}

function ChatDefaultSelect({
  disabled = false,
  label,
  onChange,
  options,
  testId,
  value,
}: {
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  testId: string;
  value: string;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-xs font-medium text-foreground">{label}</span>
      <select
        className={cn(selectClassName, disabled && "opacity-60")}
        data-testid={testId}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ChatDefaultsStatus({
  dirty,
  error,
  status,
}: {
  dirty: boolean;
  error: string | null;
  status: ChatDefaultsStoreStatus;
}) {
  if (error) {
    return (
      <div className="flex min-w-0 items-start gap-2 rounded-sm border border-status-critical bg-status-critical/15 px-2 py-1.5 text-xs text-status-critical">
        <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 break-words">{error}</span>
      </div>
    );
  }
  if (status === "loading") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading chat defaults
      </div>
    );
  }
  if (status === "saving") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Saving chat defaults
      </div>
    );
  }
  if (dirty) {
    return <div className="text-xs text-muted-foreground">Unsaved chat defaults</div>;
  }
  if (status === "ready") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Check className="h-3.5 w-3.5" />
        Chat defaults saved
      </div>
    );
  }
  return null;
}

function PermissionEscalationConfirmation({
  onCancel,
  onConfirm,
  preset,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  preset: ChatPermissionPreset;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 px-4">
      <div
        aria-modal="true"
        className="grid w-full max-w-sm gap-3 rounded-sm border border-border bg-card p-4 shadow-lg"
        role="dialog"
      >
        <div className="flex items-start gap-2">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-status-critical" />
          <div className="grid gap-1">
            <h3 className="text-sm font-semibold text-foreground">
              {preset.danger?.confirmationTitle ?? preset.label}
            </h3>
            <p className="text-xs leading-5 text-muted-foreground">
              {preset.danger?.confirmationBody ?? preset.shortDescription}
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button onClick={onCancel}>Cancel</Button>
          <Button onClick={onConfirm} ref={confirmRef} variant="primary">
            Use Permission Mode
          </Button>
        </div>
      </div>
    </div>
  );
}

interface SelectOption {
  label: string;
  value: string;
}

function modelSelectOptions(models: ChatModelOption[]): SelectOption[] {
  return [
    { label: "Codex default", value: "" },
    ...models.map((model) => ({ label: model.displayName, value: model.model })),
  ];
}

function reasoningSelectOptions(efforts: ChatReasoningEffortOption[]): SelectOption[] {
  return [
    { label: "Model default", value: "" },
    ...efforts.map((effort) => ({ label: effort.displayName, value: effort.effort })),
  ];
}

function reasoningEffortsForDraft(
  models: ChatModelOption[],
  draftModel: string,
): ChatReasoningEffortOption[] {
  if (!draftModel) {
    return [];
  }
  return models.find((model) => model.model === draftModel)?.supportedReasoningEfforts ?? [];
}
