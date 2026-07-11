import type {
  ChatCodexPermissionSettings,
  ChatPermissionPreset,
  ReasoningEffort,
  WorkflowAgentSettings,
} from "@generated/backend";
import { reasoningEffortValues } from "@generated/backend";
import { ShieldAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "../../lib/utils";
import { chatCodexPermissionSettingsFromPreset } from "../../stores/chat-defaults-store";

export interface WorkflowAgentSettingsDraft {
  model: string;
  permission: ChatCodexPermissionSettings | null;
  reasoningEffort: string;
}

export function workflowAgentSettingsDraftFromSettings(
  settings: WorkflowAgentSettings | null | undefined,
): WorkflowAgentSettingsDraft {
  return {
    model: settings?.model ?? "",
    permission: settings?.permission ? { ...settings.permission } : null,
    reasoningEffort: settings?.reasoningEffort ?? "",
  };
}

export function workflowAgentSettingsFromDraft(
  draft: WorkflowAgentSettingsDraft,
): WorkflowAgentSettings {
  return {
    model: draft.model.trim(),
    permission: draft.permission ? { ...draft.permission } : null,
    reasoningEffort: reasoningEffortFromDraft(draft.reasoningEffort),
  };
}

export function WorkflowAgentPermissionField({
  disabled,
  inheritLabel,
  onPermissionChange,
  permission,
  permissionPresets,
  testId,
}: {
  disabled: boolean;
  inheritLabel: string;
  onPermissionChange: (permission: ChatCodexPermissionSettings | null) => void;
  permission: ChatCodexPermissionSettings | null;
  permissionPresets: ChatPermissionPreset[];
  testId: string;
}) {
  const [confirmPreset, setConfirmPreset] = useState<ChatPermissionPreset | null>(null);
  const selectedPreset = permission?.preset ?? "";

  function requestPresetChange(preset: ChatPermissionPreset) {
    if (preset.disabled) {
      return;
    }
    if (preset.danger?.requiresConfirmation && preset.id !== selectedPreset) {
      setConfirmPreset(preset);
      return;
    }
    onPermissionChange(chatCodexPermissionSettingsFromPreset(preset));
  }

  return (
    <fieldset className="grid gap-1.5 text-xs text-zinc-400">
      <legend>Permission</legend>
      <div className="grid gap-1.5 sm:grid-cols-2" data-testid={testId}>
        <WorkflowAgentPermissionOption
          disabled={disabled}
          label={inheritLabel}
          onClick={() => onPermissionChange(null)}
          pressed={permission === null}
          shortDescription="Use inherited permission settings"
          value="inherit"
        />
        {permissionPresets.map((preset) => (
          <WorkflowAgentPermissionOption
            disabled={disabled || preset.disabled}
            key={preset.id}
            label={preset.label}
            onClick={() => requestPresetChange(preset)}
            pressed={preset.id === selectedPreset}
            shortDescription={preset.shortDescription}
            title={preset.disabled ? preset.disabledReason : preset.label}
            value={preset.id}
          />
        ))}
      </div>
      {permissionPresets.length === 0 ? (
        <div className="text-[11px] text-zinc-500">Loading permission presets</div>
      ) : null}
      {confirmPreset ? (
        <WorkflowAgentPermissionConfirmation
          onCancel={() => setConfirmPreset(null)}
          onConfirm={() => {
            onPermissionChange(chatCodexPermissionSettingsFromPreset(confirmPreset));
            setConfirmPreset(null);
          }}
          preset={confirmPreset}
        />
      ) : null}
    </fieldset>
  );
}

function WorkflowAgentPermissionOption({
  disabled,
  label,
  onClick,
  pressed,
  shortDescription,
  title,
  value,
}: {
  disabled: boolean;
  label: string;
  onClick: () => void;
  pressed: boolean;
  shortDescription: string;
  title?: string;
  value: string;
}) {
  return (
    <button
      aria-pressed={pressed}
      className={cn(
        "flex min-h-12 min-w-0 flex-col items-start justify-center rounded-sm border px-2 py-1.5 text-left outline-none transition-colors focus-visible:border-cyan-400",
        pressed
          ? "border-cyan-400 bg-cyan-400/10 text-zinc-100"
          : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-100",
        disabled && "cursor-not-allowed opacity-50",
      )}
      data-permission-preset={value}
      disabled={disabled}
      onClick={onClick}
      title={title ?? label}
      type="button"
    >
      <span className="truncate font-medium">{label}</span>
      <span className="text-[11px] leading-4">{shortDescription}</span>
    </button>
  );
}

function WorkflowAgentPermissionConfirmation({
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
    <div className="fixed inset-0 z-50 grid place-items-center bg-zinc-950/80 px-4">
      <div
        aria-modal="true"
        className="grid w-full max-w-sm gap-3 rounded-sm border border-zinc-700 bg-zinc-900 p-4 shadow-lg"
        role="dialog"
      >
        <div className="flex items-start gap-2">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
          <div className="grid gap-1">
            <h3 className="text-sm font-semibold text-zinc-100">
              {preset.danger?.confirmationTitle ?? preset.label}
            </h3>
            <p className="text-xs leading-5 text-zinc-400">
              {preset.danger?.confirmationBody ?? preset.shortDescription}
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            className="h-8 rounded-sm border border-zinc-700 px-3 text-xs text-zinc-200"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="h-8 rounded-sm bg-cyan-500 px-3 text-xs font-medium text-zinc-950"
            onClick={onConfirm}
            ref={confirmRef}
            type="button"
          >
            Use {preset.label}
          </button>
        </div>
      </div>
    </div>
  );
}

function reasoningEffortFromDraft(value: string): ReasoningEffort | null {
  const normalized = value.trim();
  if (normalized === "") {
    return null;
  }
  if (reasoningEffortValues.includes(normalized as ReasoningEffort)) {
    return normalized as ReasoningEffort;
  }
  throw new Error(`Unsupported reasoning effort: ${normalized}`);
}
