import type { ChatPermissionPreset, WorkflowDefinition } from "@generated/backend";
import { RefreshCcw, Save } from "lucide-react";
import { useEffect, useState } from "react";

import { useChatDefaultsStore } from "../../stores/chat-defaults-store";
import { useWorkflowDefinitionStore } from "../../stores/workflow-definition-store";
import {
  useWorkflowEditorStore,
  type WorkflowSettingsTarget,
} from "../../stores/workflow-editor-store";
import {
  WorkflowAgentPermissionField,
  workflowAgentSettingsDraftFromSettings,
  workflowAgentSettingsFromDraft,
  type WorkflowAgentSettingsDraft,
} from "./workflow-agent-settings-form";

type WorkflowDefinitionRecord = WorkflowDefinition;
const emptyPermissionPresets: ChatPermissionPreset[] = [];

interface WorkflowSettingsDraft {
  agentDefaults: WorkflowAgentSettingsDraft;
  description: string;
  name: string;
}

export function WorkflowSettingsSurface() {
  const target = useWorkflowEditorStore((state) => state.selectedWorkflowSettingsTarget);
  const notifyWorkflowDefinitionChanged = useWorkflowEditorStore(
    (state) => state.notifyWorkflowDefinitionChanged,
  );
  const setSelectedWorkflowSettingsTarget = useWorkflowEditorStore(
    (state) => state.setSelectedWorkflowSettingsTarget,
  );
  const { definition, loadError, setDefinition, setLoadError } =
    useWorkflowSettingsDefinition(target);
  const [draft, setDraft] = useState<WorkflowSettingsDraft>(() => emptyDraft());
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const loadChatDefaults = useChatDefaultsStore((state) => state.load);
  const chatDefaultsView = useChatDefaultsStore((state) => state.view);
  const permissionPresets = chatDefaultsView?.permissionPresets ?? emptyPermissionPresets;

  useEffect(() => {
    if (definition !== null) {
      setDraft({
        agentDefaults: workflowAgentSettingsDraftFromSettings(definition.graph.agentDefaults),
        description: definition.description,
        name: definition.name,
      });
      return;
    }
    if (target !== null) {
      setDraft({
        agentDefaults: workflowAgentSettingsDraftFromSettings(null),
        description: target.definitionDescription,
        name: target.definitionName,
      });
      return;
    }
    setDraft(emptyDraft());
  }, [definition, target]);

  useEffect(() => {
    setSaveMessage("");
  }, [target]);

  useEffect(() => {
    if (target !== null && target.definitionId !== "") {
      void loadChatDefaults();
    }
  }, [loadChatDefaults, target]);

  async function saveWorkflowSettings() {
    if (target === null || definition === null || !target.editable) {
      return;
    }
    setSaving(true);
    setLoadError("");
    setSaveMessage("Saving");
    try {
      const currentDefinition = await window.setta.workflow.readDefinition(
        target.workspaceId,
        target.definitionId,
      );
      const updated = await window.setta.workflow.updateDefinition(
        target.workspaceId,
        target.definitionId,
        draft.name,
        draft.description,
        {
          ...currentDefinition.graph,
          agentDefaults: workflowAgentSettingsFromDraft(draft.agentDefaults),
        },
      );
      setDefinition(updated);
      setSelectedWorkflowSettingsTarget({
        ...target,
        definitionDescription: updated.description,
        definitionName: updated.name,
      });
      setSaveMessage("Saved");
      notifyWorkflowDefinitionChanged(target.workspaceId, target.definitionId);
      await useWorkflowDefinitionStore
        .getState()
        .refreshWorkspaceWorkflowDefinitions(target.workspaceId);
    } catch (error: unknown) {
      setLoadError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      className="flex h-full min-h-0 flex-col bg-zinc-950 text-zinc-100"
      data-testid="workflow-settings-surface"
    >
      <header className="border-b border-zinc-800 px-4 py-3">
        <div className="truncate text-sm font-semibold text-zinc-100">Workflow Settings</div>
        <div className="mt-1 text-xs text-zinc-500">{workflowSettingsSubtitle(target)}</div>
      </header>
      <WorkflowSettingsContent
        definition={definition}
        draft={draft}
        loadError={loadError}
        onDraftChange={setDraft}
        onSave={() => void saveWorkflowSettings()}
        permissionPresets={permissionPresets}
        saveMessage={saveMessage}
        saving={saving}
        target={target}
      />
    </section>
  );
}

function useWorkflowSettingsDefinition(target: WorkflowSettingsTarget | null) {
  const [definition, setDefinition] = useState<WorkflowDefinitionRecord | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let disposed = false;
    setDefinition(null);
    setLoadError("");
    if (target === null || target.definitionId === "") {
      return;
    }
    void window.setta.workflow
      .readDefinition(target.workspaceId, target.definitionId)
      .then((loadedDefinition) => {
        if (!disposed) {
          setDefinition(loadedDefinition);
        }
      })
      .catch((error: unknown) => {
        if (!disposed) {
          setLoadError(errorMessage(error));
        }
      });
    return () => {
      disposed = true;
    };
  }, [target]);

  return { definition, loadError, setDefinition, setLoadError };
}

function WorkflowSettingsContent({
  definition,
  draft,
  loadError,
  onDraftChange,
  onSave,
  permissionPresets,
  saveMessage,
  saving,
  target,
}: {
  definition: WorkflowDefinitionRecord | null;
  draft: WorkflowSettingsDraft;
  loadError: string;
  onDraftChange: (draft: WorkflowSettingsDraft) => void;
  onSave: () => void;
  permissionPresets: ChatPermissionPreset[];
  saveMessage: string;
  saving: boolean;
  target: WorkflowSettingsTarget | null;
}) {
  if (target === null) {
    return <WorkflowSettingsEmpty message="Open a workflow to edit its settings." />;
  }
  if (loadError !== "") {
    return <WorkflowSettingsError message={loadError} />;
  }
  if (target.definitionId === "") {
    return <WorkflowSettingsEmpty message="Add a node before naming this workflow." />;
  }
  if (definition === null) {
    return <WorkflowSettingsEmpty message="Loading workflow settings" />;
  }
  const readOnly = !target.editable;
  const disabled = saving || readOnly;
  return (
    <form
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4"
      data-testid="workflow-settings-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <WorkflowReadOnlyNotice readOnly={readOnly} />
      <WorkflowTextField
        disabled={disabled}
        label="Name"
        onChange={(name) => onDraftChange({ ...draft, name })}
        value={draft.name}
      />
      <WorkflowTextArea
        disabled={disabled}
        label="Description"
        onChange={(description) => onDraftChange({ ...draft, description })}
        value={draft.description}
      />
      <WorkflowAgentDefaultsSection
        disabled={disabled}
        draft={draft}
        onDraftChange={onDraftChange}
        permissionPresets={permissionPresets}
      />
      <WorkflowSettingsSaveRow
        disabled={disabled}
        onSave={onSave}
        saveMessage={saveMessage}
        saving={saving}
      />
    </form>
  );
}

function WorkflowAgentDefaultsSection({
  disabled,
  draft,
  onDraftChange,
  permissionPresets,
}: {
  disabled: boolean;
  draft: WorkflowSettingsDraft;
  onDraftChange: (draft: WorkflowSettingsDraft) => void;
  permissionPresets: ChatPermissionPreset[];
}) {
  const agentDefaults = draft.agentDefaults;
  return (
    <section className="grid gap-3 rounded-sm border border-zinc-800 bg-zinc-950/60 p-3">
      <div className="text-xs font-medium text-zinc-200">Agent Defaults</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <WorkflowTextField
          disabled={disabled}
          label="Default model"
          onChange={(model) =>
            onDraftChange({ ...draft, agentDefaults: { ...agentDefaults, model } })
          }
          placeholder="app default"
          value={agentDefaults.model}
        />
        <WorkflowTextField
          disabled={disabled}
          label="Default reasoning"
          onChange={(reasoningEffort) =>
            onDraftChange({
              ...draft,
              agentDefaults: { ...agentDefaults, reasoningEffort },
            })
          }
          placeholder="app default"
          value={agentDefaults.reasoningEffort}
        />
      </div>
      <WorkflowAgentPermissionField
        disabled={disabled}
        inheritLabel="App default"
        onPermissionChange={(permission) =>
          onDraftChange({ ...draft, agentDefaults: { ...agentDefaults, permission } })
        }
        permission={agentDefaults.permission}
        permissionPresets={permissionPresets}
        testId="workflow-agent-default-permission"
      />
    </section>
  );
}

function WorkflowReadOnlyNotice({ readOnly }: { readOnly: boolean }) {
  if (!readOnly) {
    return null;
  }
  return (
    <div className="rounded-sm border border-amber-500/30 bg-amber-950/30 px-3 py-2 text-xs text-amber-100">
      Switch to the draft workflow before editing settings.
    </div>
  );
}

function WorkflowSettingsSaveRow({
  disabled,
  onSave,
  saveMessage,
  saving,
}: {
  disabled: boolean;
  onSave: () => void;
  saveMessage: string;
  saving: boolean;
}) {
  return (
    <div className="mt-auto flex items-center justify-between gap-3 border-t border-zinc-800 pt-3">
      <div className="min-w-0 text-xs text-zinc-400" data-testid="workflow-settings-save-state">
        {saveMessage}
      </div>
      <button
        className="inline-flex h-8 items-center gap-2 rounded-sm bg-cyan-500 px-3 text-xs font-medium text-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
        data-testid="workflow-settings-save-button"
        disabled={disabled}
        onClick={onSave}
        type="button"
      >
        {saving ? (
          <RefreshCcw className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Save className="h-3.5 w-3.5" />
        )}
        Save
      </button>
    </div>
  );
}

function WorkflowTextField({
  disabled,
  label,
  onChange,
  placeholder,
  value,
}: {
  disabled: boolean;
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-xs text-zinc-400">
      {label}
      <input
        className="h-8 rounded-sm border border-zinc-700 bg-zinc-900 px-2 text-sm text-zinc-100 outline-none focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
        data-testid={workflowTextFieldTestId(label)}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}

function WorkflowTextArea({
  disabled,
  label,
  onChange,
  value,
}: {
  disabled: boolean;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="flex min-h-0 flex-1 flex-col gap-1.5 text-xs text-zinc-400">
      {label}
      <textarea
        className="min-h-36 flex-1 resize-none rounded-sm border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm leading-5 text-zinc-100 outline-none focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
        data-testid={label === "Description" ? "workflow-settings-description" : undefined}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
        value={value}
      />
    </label>
  );
}

function WorkflowSettingsEmpty({ message }: { message: string }) {
  return <div className="p-4 text-sm text-zinc-400">{message}</div>;
}

function WorkflowSettingsError({ message }: { message: string }) {
  return (
    <div
      className="m-4 rounded-sm border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-100"
      role="alert"
    >
      {message}
    </div>
  );
}

function workflowSettingsSubtitle(target: WorkflowSettingsTarget | null) {
  if (target === null || target.definitionName === "") {
    return "workflow settings";
  }
  return target.definitionName;
}

function emptyDraft(): WorkflowSettingsDraft {
  return {
    agentDefaults: workflowAgentSettingsDraftFromSettings(null),
    description: "",
    name: "",
  };
}

function workflowTextFieldTestId(label: string) {
  switch (label) {
    case "Name":
      return "workflow-settings-name";
    case "Default model":
      return "workflow-agent-default-model";
    case "Default reasoning":
      return "workflow-agent-default-reasoning";
    default:
      return undefined;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Workflow settings operation failed";
}
