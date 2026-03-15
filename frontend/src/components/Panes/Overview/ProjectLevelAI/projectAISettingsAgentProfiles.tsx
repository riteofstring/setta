import { useEffect, useMemo, useState } from "react";
import {
  createAgentProfile,
  deleteAgentProfile,
  updateAgentProfile,
} from "state/actions/aiConfigurationCatalogMutations";
import { useAIStore } from "state/definitions";
import type { AgentProfile } from "utils/generatedTypes";
import { shallow } from "zustand/shallow";
import {
  Field,
  INPUT_CLASS_NAME,
  MANAGER_FORM_CLASS_NAME,
  MANAGER_LIST_CLASS_NAME,
  TEXTAREA_CLASS_NAME,
} from "./projectAISettingsFormControls";
import {
  normalizeOptionalText,
  parseListInput,
} from "./projectAISettingsFormUtils";

type AgentProfileDraft = {
  name: string;
  description: string;
  systemPrompt: string;
  enableBackgroundSummaryFill: boolean;
  enableLlmChatTitles: boolean;
  engineConfigId: string;
  toolAllowlistText: string;
  memoryScope: string;
};

type AgentProfileDraftTextKey = Exclude<
  keyof AgentProfileDraft,
  "enableBackgroundSummaryFill" | "enableLlmChatTitles"
>;

export function ProjectAISettingsAgentProfilesManager({
  canEdit,
}: {
  canEdit: boolean;
}) {
  const { agentProfiles } = useAIStore(
    (state) => ({ agentProfiles: state.agentProfiles }),
    shallow,
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [draft, setDraft] = useState<AgentProfileDraft | null>(null);

  useEffect(() => {
    if (isCreating) {
      return;
    }
    if (!activeId) {
      if (agentProfiles.length > 0) {
        setActiveId(agentProfiles[0].id);
      }
      return;
    }
    const exists = agentProfiles.some((profile) => profile.id === activeId);
    if (!exists) {
      setActiveId(agentProfiles.length > 0 ? agentProfiles[0].id : null);
    }
  }, [activeId, agentProfiles, isCreating]);

  const activeProfile = useMemo(() => {
    if (!activeId) {
      return null;
    }
    return agentProfiles.find((profile) => profile.id === activeId) ?? null;
  }, [activeId, agentProfiles]);

  useEffect(() => {
    if (isCreating) {
      setDraft({
        name: "",
        description: "",
        systemPrompt: "",
        enableBackgroundSummaryFill: false,
        enableLlmChatTitles: false,
        engineConfigId: "",
        toolAllowlistText: "",
        memoryScope: "",
      });
      return;
    }
    if (!activeProfile) {
      setDraft(null);
      return;
    }
    setDraft(buildAgentProfileDraft(activeProfile));
  }, [activeProfile, isCreating]);

  const handleCreateClick = () => {
    if (!canEdit) {
      return;
    }
    setIsCreating(true);
    setActiveId(null);
  };

  const handleSave = async () => {
    if (!draft) {
      return;
    }
    const toolAllowlist = parseListInput(draft.toolAllowlistText);
    if (isCreating) {
      const created = await createAgentProfile({
        name: draft.name.trim(),
        description: draft.description.trim(),
        systemPrompt: draft.systemPrompt,
        enableBackgroundSummaryFill: draft.enableBackgroundSummaryFill,
        enableLlmChatTitles: draft.enableLlmChatTitles,
        engineConfigId: normalizeOptionalText(draft.engineConfigId),
        toolAllowlist,
        memoryScope: normalizeOptionalText(draft.memoryScope),
      });
      if (created) {
        setIsCreating(false);
        setActiveId(created.id);
      }
      return;
    }
    if (!activeProfile) {
      return;
    }
    const updated = await updateAgentProfile({
      profile: {
        ...activeProfile,
        name: draft.name.trim(),
        description: draft.description.trim(),
        systemPrompt: draft.systemPrompt,
        enableBackgroundSummaryFill: draft.enableBackgroundSummaryFill,
        enableLlmChatTitles: draft.enableLlmChatTitles,
        engineConfigId: normalizeOptionalText(draft.engineConfigId),
        toolAllowlist,
        memoryScope: normalizeOptionalText(draft.memoryScope),
      },
    });
    if (updated) {
      setActiveId(updated.id);
    }
  };

  const handleDelete = async () => {
    if (!activeProfile) {
      return;
    }
    const deleted = await deleteAgentProfile({ profileId: activeProfile.id });
    if (deleted) {
      setActiveId(null);
    }
  };

  const handleCancel = () => {
    if (isCreating) {
      setIsCreating(false);
      return;
    }
    if (activeProfile) {
      setDraft(buildAgentProfileDraft(activeProfile));
    }
  };

  const handleFieldChange = (key: AgentProfileDraftTextKey, value: string) => {
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      return { ...prev, [key]: value };
    });
  };

  const handleToggleChange = (
    key: "enableBackgroundSummaryFill" | "enableLlmChatTitles",
    value: boolean,
  ) => {
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      return { ...prev, [key]: value };
    });
  };

  const isSaveDisabled = !canEdit || !draft;
  const isDeleteDisabled = !canEdit || !activeProfile || isCreating;
  const isCancelDisabled = !draft;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="h-8 rounded-md border border-setta-200 bg-white px-3 text-xs font-semibold text-setta-600 transition-colors hover:bg-setta-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200"
          onClick={handleCreateClick}
          disabled={!canEdit}
        >
          New Profile
        </button>
        {isCreating ? (
          <span className="text-xs text-setta-500 dark:text-setta-400">
            Creating a new agent profile.
          </span>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-col gap-3 @container @[42rem]:flex-row">
        <div className={`${MANAGER_LIST_CLASS_NAME} @[42rem]:w-64`}>
          {agentProfiles.length === 0 ? (
            <div className="py-4 text-center text-xs text-setta-400">
              No profiles yet.
            </div>
          ) : (
            agentProfiles.map((profile) => {
              const isActive = profile.id === activeId && !isCreating;
              let itemClassName =
                "rounded-md px-2 py-2 text-left text-xs transition-colors";
              if (isActive) {
                itemClassName += " bg-blue-600 text-white dark:bg-blue-700";
              } else {
                itemClassName +=
                  " hover:bg-setta-50 dark:hover:bg-setta-800/60";
              }
              return (
                <button
                  type="button"
                  key={profile.id}
                  className={itemClassName}
                  onClick={() => {
                    if (isCreating) {
                      return;
                    }
                    setActiveId(profile.id);
                  }}
                >
                  <p className="truncate font-semibold">
                    {profile.name || "Untitled"}
                  </p>
                  {profile.description ? (
                    <p className="truncate text-[11px] opacity-80">
                      {profile.description}
                    </p>
                  ) : null}
                </button>
              );
            })
          )}
        </div>

        <div className={MANAGER_FORM_CLASS_NAME}>
          {!draft ? (
            <div className="text-xs text-setta-400">
              Select a profile to edit.
            </div>
          ) : (
            <>
              <Field label="Name">
                <input
                  value={draft.name}
                  onChange={(event) =>
                    handleFieldChange("name", event.target.value)
                  }
                  className={INPUT_CLASS_NAME}
                  disabled={!canEdit}
                />
              </Field>
              <Field label="Description">
                <input
                  value={draft.description}
                  onChange={(event) =>
                    handleFieldChange("description", event.target.value)
                  }
                  className={INPUT_CLASS_NAME}
                  disabled={!canEdit}
                />
              </Field>
              <Field label="System Prompt">
                <textarea
                  value={draft.systemPrompt}
                  onChange={(event) =>
                    handleFieldChange("systemPrompt", event.target.value)
                  }
                  className={TEXTAREA_CLASS_NAME}
                  disabled={!canEdit}
                />
              </Field>
              <Field
                label="Background Summary Fill"
                hint="When enabled, Setta may generate missing section summaries in the background during a chat run."
              >
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={draft.enableBackgroundSummaryFill}
                    onChange={(event) =>
                      handleToggleChange(
                        "enableBackgroundSummaryFill",
                        event.target.checked,
                      )
                    }
                    className="h-4 w-4 accent-blue-600"
                    disabled={!canEdit}
                    aria-label="Enable Background Summary Fill"
                  />
                  <span>Enable</span>
                </label>
              </Field>
              <Field
                label="LLM Chat Titles"
                hint="When enabled, Setta may call the LLM to generate chat titles after runs complete."
              >
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={draft.enableLlmChatTitles}
                    onChange={(event) =>
                      handleToggleChange(
                        "enableLlmChatTitles",
                        event.target.checked,
                      )
                    }
                    className="h-4 w-4 accent-blue-600"
                    disabled={!canEdit}
                    aria-label="Enable LLM Chat Titles"
                  />
                  <span>Enable</span>
                </label>
              </Field>
              <Field
                label="Engine Config ID"
                hint="Leave empty to use the engine assigned elsewhere."
              >
                <input
                  value={draft.engineConfigId}
                  onChange={(event) =>
                    handleFieldChange("engineConfigId", event.target.value)
                  }
                  className={INPUT_CLASS_NAME}
                  disabled={!canEdit}
                />
              </Field>
              <Field
                label="Tool Allowlist"
                hint="One tool name per line. Use server__tool for MCP names."
              >
                <textarea
                  value={draft.toolAllowlistText}
                  onChange={(event) =>
                    handleFieldChange("toolAllowlistText", event.target.value)
                  }
                  className={TEXTAREA_CLASS_NAME}
                  disabled={!canEdit}
                />
              </Field>
              <Field label="Memory Scope">
                <input
                  value={draft.memoryScope}
                  onChange={(event) =>
                    handleFieldChange("memoryScope", event.target.value)
                  }
                  className={INPUT_CLASS_NAME}
                  disabled={!canEdit}
                />
              </Field>

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  className="h-8 rounded-md bg-blue-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => void handleSave()}
                  disabled={isSaveDisabled}
                >
                  Save
                </button>
                <button
                  type="button"
                  className="h-8 rounded-md border border-setta-200 bg-white px-3 text-xs font-semibold text-setta-600 transition-colors hover:bg-setta-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200"
                  onClick={handleCancel}
                  disabled={isCancelDisabled}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="h-8 rounded-md border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-300"
                  onClick={() => void handleDelete()}
                  disabled={isDeleteDisabled}
                >
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function buildAgentProfileDraft(profile: AgentProfile): AgentProfileDraft {
  return {
    name: profile.name ?? "",
    description: profile.description ?? "",
    systemPrompt: profile.systemPrompt ?? "",
    enableBackgroundSummaryFill: profile.enableBackgroundSummaryFill ?? false,
    enableLlmChatTitles: profile.enableLlmChatTitles ?? false,
    engineConfigId: profile.engineConfigId ?? "",
    toolAllowlistText: (profile.toolAllowlist ?? []).join("\n"),
    memoryScope: profile.memoryScope ?? "",
  };
}
