import { ProjectLLMSettings } from "components/Panes/Overview/ProjectLevelAI/ProjectLLMSettings";
import {
  createAgentProfile,
  createExternalAgentConfig,
  createPromptTemplate,
  deleteAgentProfile,
  deleteExternalAgentConfig,
  deletePromptTemplate,
  updateAgentProfile,
  updateExternalAgentConfig,
  updatePromptTemplate,
} from "state/actions/ai";
import { useAIStore, useShareSession } from "state/definitions";
import {
  AgentProfile,
  ExternalAgentConfig,
  ExternalAgentRunModeEnum,
  ExternalAgentToolTypeEnum,
  ExternalAgentWorkingDirStrategyEnum,
  PromptFormatEnum,
  PromptTemplate,
} from "utils/generatedTypes";
import {
  type ChangeEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import { shallow } from "zustand/shallow";
import { useHydrateAgenticState } from "./useHydrateAgenticState";

type SectionCardProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

type FieldProps = {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
};

type AgentProfileDraft = {
  name: string;
  description: string;
  systemPrompt: string;
  llmConfigId: string;
  toolAllowlistText: string;
  memoryScope: string;
};

type PromptTemplateDraft = {
  name: string;
  description: string;
  template: string;
  format: PromptFormatValue;
  inputSchemaText: string;
  metadataText: string;
};

type ExternalAgentConfigDraft = {
  name: string;
  description: string;
  toolType: ExternalAgentToolTypeValue;
  runMode: ExternalAgentRunModeValue;
  commandPath: string;
  baseUrl: string;
  defaultModel: string;
  sandboxPolicy: string;
  approvalPolicy: string;
  envVarWhitelistText: string;
  workingDirStrategy: ExternalAgentWorkingDirStrategyValue;
  workingDir: string;
};

type PromptFormatValue =
  (typeof PromptFormatEnum)[keyof typeof PromptFormatEnum];
type ExternalAgentToolTypeValue =
  (typeof ExternalAgentToolTypeEnum)[keyof typeof ExternalAgentToolTypeEnum];
type ExternalAgentRunModeValue =
  (typeof ExternalAgentRunModeEnum)[keyof typeof ExternalAgentRunModeEnum];
type ExternalAgentWorkingDirStrategyValue =
  (typeof ExternalAgentWorkingDirStrategyEnum)[keyof typeof ExternalAgentWorkingDirStrategyEnum];

const INPUT_CLASS_NAME =
  "h-8 w-full rounded-md border border-solid border-setta-200 bg-white/80 px-2 text-xs text-setta-800 focus:!border-blue-500 focus:outline-0 focus:ring-0 disabled:cursor-not-allowed disabled:bg-setta-100 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-300";
const TEXTAREA_CLASS_NAME =
  "min-h-[110px] w-full resize-y rounded-md border border-solid border-setta-200 bg-white/80 p-3 font-mono text-xs text-setta-800 placeholder-setta-300 focus:!border-blue-500 focus:outline-0 focus:ring-0 disabled:cursor-not-allowed disabled:bg-setta-100 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-300 dark:placeholder-setta-600";
const SELECT_CLASS_NAME =
  "h-8 w-full rounded-md border border-solid border-setta-200 bg-white/80 px-2 text-xs text-setta-800 focus:!border-blue-500 focus:outline-0 focus:ring-0 disabled:cursor-not-allowed disabled:bg-setta-100 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-300";

export function ProjectAISettings() {
  useHydrateAgenticState();
  const isShareMode = useShareSession((x) => x.isShareMode);
  const canEdit = !isShareMode;

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-y-auto pb-[15dvh] text-setta-700 dark:text-setta-300">
      <SectionCard
        title="LLM API Keys"
        description="Manage API keys for built-in LLM engines."
      >
        {isShareMode ? (
          <ShareModeNotice />
        ) : (
          <ProjectLLMSettings className="pb-2" />
        )}
      </SectionCard>

      <SectionCard
        title="Agent Profiles"
        description="Create reusable agent personas and tool allowlists."
      >
        <AgentProfilesManager canEdit={canEdit} />
      </SectionCard>

      <SectionCard
        title="Prompt Templates"
        description="Store reusable prompt assets for Prompt sections."
      >
        <PromptTemplatesManager canEdit={canEdit} />
      </SectionCard>

      <SectionCard
        title="External Agents"
        description="Configure Claude Code, Codex, or OpenCode adapters."
      >
        <ExternalAgentConfigsManager canEdit={canEdit} />
      </SectionCard>
    </div>
  );
}

function SectionCard({ title, description, children }: SectionCardProps) {
  return (
    <section className="rounded-lg border border-setta-200/70 bg-white/70 p-4 shadow-sm dark:border-setta-800 dark:bg-setta-900/40">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-setta-800 dark:text-setta-100">
            {title}
          </h3>
          {description ? (
            <p className="mt-1 text-xs text-setta-500 dark:text-setta-400">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Field({ label, hint, error, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
        {label}
      </span>
      {children}
      {hint ? (
        <p className="text-[11px] text-setta-500 dark:text-setta-400">{hint}</p>
      ) : null}
      {error ? (
        <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>
      ) : null}
    </div>
  );
}

function ShareModeNotice() {
  return (
    <div className="rounded-md border border-setta-200/70 bg-setta-50 px-3 py-2 text-xs text-setta-600 dark:border-setta-800 dark:bg-setta-900/70 dark:text-setta-300">
      LLM settings are unavailable in share mode.
    </div>
  );
}

function AgentProfilesManager({ canEdit }: { canEdit: boolean }) {
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
        llmConfigId: "",
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

  const listClassName =
    "flex max-h-[360px] flex-col gap-1 overflow-y-auto rounded-md border border-setta-200/60 p-2 dark:border-setta-800";

  const formClassName =
    "flex min-h-0 flex-1 flex-col gap-4 rounded-md border border-setta-200/60 p-3 dark:border-setta-800";

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
        llmConfigId: normalizeOptionalText(draft.llmConfigId),
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
        llmConfigId: normalizeOptionalText(draft.llmConfigId),
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

  const handleFieldChange = (
    key: keyof AgentProfileDraft,
    value: string,
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
        <div className={`${listClassName} @[42rem]:w-64`}>
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
                itemClassName +=
                  " bg-blue-600 text-white dark:bg-blue-700";
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

        <div className={formClassName}>
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
                label="LLM Config ID"
                hint="Leave empty to use the default LLM config."
              >
                <input
                  value={draft.llmConfigId}
                  onChange={(event) =>
                    handleFieldChange("llmConfigId", event.target.value)
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

function PromptTemplatesManager({ canEdit }: { canEdit: boolean }) {
  const { promptTemplates } = useAIStore(
    (state) => ({ promptTemplates: state.promptTemplates }),
    shallow,
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [draft, setDraft] = useState<PromptTemplateDraft | null>(null);
  const [inputSchemaError, setInputSchemaError] = useState<string | null>(null);
  const [metadataError, setMetadataError] = useState<string | null>(null);

  const formatOptions = useMemo(() => Object.values(PromptFormatEnum), []);

  useEffect(() => {
    if (isCreating) {
      return;
    }
    if (!activeId) {
      if (promptTemplates.length > 0) {
        setActiveId(promptTemplates[0].id);
      }
      return;
    }
    const exists = promptTemplates.some((template) => template.id === activeId);
    if (!exists) {
      setActiveId(promptTemplates.length > 0 ? promptTemplates[0].id : null);
    }
  }, [activeId, isCreating, promptTemplates]);

  const activeTemplate = useMemo(() => {
    if (!activeId) {
      return null;
    }
    return promptTemplates.find((template) => template.id === activeId) ?? null;
  }, [activeId, promptTemplates]);

  useEffect(() => {
    if (isCreating) {
      setDraft({
        name: "",
        description: "",
        template: "",
        format: PromptFormatEnum.Jinja,
        inputSchemaText: "{}",
        metadataText: "{}",
      });
      setInputSchemaError(null);
      setMetadataError(null);
      return;
    }
    if (!activeTemplate) {
      setDraft(null);
      return;
    }
    setDraft(buildPromptTemplateDraft(activeTemplate));
    setInputSchemaError(null);
    setMetadataError(null);
  }, [activeTemplate, isCreating]);

  const listClassName =
    "flex max-h-[360px] flex-col gap-1 overflow-y-auto rounded-md border border-setta-200/60 p-2 dark:border-setta-800";

  const formClassName =
    "flex min-h-0 flex-1 flex-col gap-4 rounded-md border border-setta-200/60 p-3 dark:border-setta-800";

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
    const inputSchemaResult = parseJsonObject(draft.inputSchemaText);
    if (inputSchemaResult.error) {
      setInputSchemaError(inputSchemaResult.error);
      return;
    }
    const metadataResult = parseJsonObject(draft.metadataText);
    if (metadataResult.error) {
      setMetadataError(metadataResult.error);
      return;
    }
    setInputSchemaError(null);
    setMetadataError(null);

    if (isCreating) {
      const created = await createPromptTemplate({
        name: draft.name.trim(),
        description: draft.description.trim(),
        template: draft.template,
        format: draft.format,
        inputSchema: inputSchemaResult.value,
        metadata: metadataResult.value,
      });
      if (created) {
        setIsCreating(false);
        setActiveId(created.id);
      }
      return;
    }
    if (!activeTemplate) {
      return;
    }
    const updated = await updatePromptTemplate({
      template: {
        ...activeTemplate,
        name: draft.name.trim(),
        description: draft.description.trim(),
        template: draft.template,
        format: draft.format,
        inputSchema: inputSchemaResult.value,
        metadata: metadataResult.value,
      },
    });
    if (updated) {
      setActiveId(updated.id);
    }
  };

  const handleDelete = async () => {
    if (!activeTemplate) {
      return;
    }
    const deleted = await deletePromptTemplate({
      templateId: activeTemplate.id,
    });
    if (deleted) {
      setActiveId(null);
    }
  };

  const handleCancel = () => {
    if (isCreating) {
      setIsCreating(false);
      return;
    }
    if (activeTemplate) {
      setDraft(buildPromptTemplateDraft(activeTemplate));
      setInputSchemaError(null);
      setMetadataError(null);
    }
  };

  const handleFieldChange = (
    key: keyof PromptTemplateDraft,
    value: string | PromptFormatValue,
  ) => {
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      return { ...prev, [key]: value } as PromptTemplateDraft;
    });
  };

  const isSaveDisabled = !canEdit || !draft;
  const isDeleteDisabled = !canEdit || !activeTemplate || isCreating;
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
          New Template
        </button>
        {isCreating ? (
          <span className="text-xs text-setta-500 dark:text-setta-400">
            Creating a new prompt template.
          </span>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-col gap-3 @container @[42rem]:flex-row">
        <div className={`${listClassName} @[42rem]:w-64`}>
          {promptTemplates.length === 0 ? (
            <div className="py-4 text-center text-xs text-setta-400">
              No templates yet.
            </div>
          ) : (
            promptTemplates.map((template) => {
              const isActive = template.id === activeId && !isCreating;
              let itemClassName =
                "rounded-md px-2 py-2 text-left text-xs transition-colors";
              if (isActive) {
                itemClassName +=
                  " bg-blue-600 text-white dark:bg-blue-700";
              } else {
                itemClassName +=
                  " hover:bg-setta-50 dark:hover:bg-setta-800/60";
              }
              return (
                <button
                  type="button"
                  key={template.id}
                  className={itemClassName}
                  onClick={() => {
                    if (isCreating) {
                      return;
                    }
                    setActiveId(template.id);
                  }}
                >
                  <p className="truncate font-semibold">
                    {template.name || "Untitled"}
                  </p>
                  {template.description ? (
                    <p className="truncate text-[11px] opacity-80">
                      {template.description}
                    </p>
                  ) : null}
                </button>
              );
            })
          )}
        </div>

        <div className={formClassName}>
          {!draft ? (
            <div className="text-xs text-setta-400">
              Select a template to edit.
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
              <Field label="Format">
                <select
                  value={draft.format}
                  onChange={(event) =>
                    handleFieldChange(
                      "format",
                      event.target.value as PromptFormatValue,
                    )
                  }
                  className={SELECT_CLASS_NAME}
                  disabled={!canEdit}
                >
                  {formatOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Template">
                <textarea
                  value={draft.template}
                  onChange={(event) =>
                    handleFieldChange("template", event.target.value)
                  }
                  className={TEXTAREA_CLASS_NAME}
                  disabled={!canEdit}
                />
              </Field>
              <Field label="Input Schema (JSON)" error={inputSchemaError}>
                <textarea
                  value={draft.inputSchemaText}
                  onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
                    handleFieldChange("inputSchemaText", event.target.value);
                    const result = parseJsonObject(event.target.value);
                    setInputSchemaError(result.error);
                  }}
                  className={TEXTAREA_CLASS_NAME}
                  disabled={!canEdit}
                />
              </Field>
              <Field label="Metadata (JSON)" error={metadataError}>
                <textarea
                  value={draft.metadataText}
                  onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
                    handleFieldChange("metadataText", event.target.value);
                    const result = parseJsonObject(event.target.value);
                    setMetadataError(result.error);
                  }}
                  className={TEXTAREA_CLASS_NAME}
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

function ExternalAgentConfigsManager({ canEdit }: { canEdit: boolean }) {
  const { externalAgentConfigs } = useAIStore(
    (state) => ({ externalAgentConfigs: state.externalAgentConfigs }),
    shallow,
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [draft, setDraft] = useState<ExternalAgentConfigDraft | null>(null);

  const toolTypeOptions = useMemo(
    () => Object.values(ExternalAgentToolTypeEnum),
    [],
  );
  const runModeOptions = useMemo(
    () => Object.values(ExternalAgentRunModeEnum),
    [],
  );
  const workingDirOptions = useMemo(
    () => Object.values(ExternalAgentWorkingDirStrategyEnum),
    [],
  );

  const defaultToolType = toolTypeOptions.length
    ? toolTypeOptions[0]
    : ExternalAgentToolTypeEnum.codex;

  useEffect(() => {
    if (isCreating) {
      return;
    }
    if (!activeId) {
      if (externalAgentConfigs.length > 0) {
        setActiveId(externalAgentConfigs[0].id);
      }
      return;
    }
    const exists = externalAgentConfigs.some((config) => config.id === activeId);
    if (!exists) {
      setActiveId(
        externalAgentConfigs.length > 0 ? externalAgentConfigs[0].id : null,
      );
    }
  }, [activeId, externalAgentConfigs, isCreating]);

  const activeConfig = useMemo(() => {
    if (!activeId) {
      return null;
    }
    return (
      externalAgentConfigs.find((config) => config.id === activeId) ?? null
    );
  }, [activeId, externalAgentConfigs]);

  useEffect(() => {
    if (isCreating) {
      setDraft({
        name: "",
        description: "",
        toolType: defaultToolType,
        runMode: ExternalAgentRunModeEnum.sdk,
        commandPath: "",
        baseUrl: "",
        defaultModel: "",
        sandboxPolicy: "",
        approvalPolicy: "",
        envVarWhitelistText: "",
        workingDirStrategy: ExternalAgentWorkingDirStrategyEnum.project_root,
        workingDir: "",
      });
      return;
    }
    if (!activeConfig) {
      setDraft(null);
      return;
    }
    setDraft(buildExternalAgentConfigDraft(activeConfig));
  }, [activeConfig, defaultToolType, isCreating]);

  const listClassName =
    "flex max-h-[360px] flex-col gap-1 overflow-y-auto rounded-md border border-setta-200/60 p-2 dark:border-setta-800";

  const formClassName =
    "flex min-h-0 flex-1 flex-col gap-4 rounded-md border border-setta-200/60 p-3 dark:border-setta-800";

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
    const envVarWhitelist = parseListInput(draft.envVarWhitelistText);
    const payloadBase = {
      name: draft.name.trim(),
      description: draft.description.trim(),
      toolType: draft.toolType,
      runMode: draft.runMode,
      commandPath: normalizeOptionalText(draft.commandPath),
      baseUrl: normalizeOptionalText(draft.baseUrl),
      defaultModel: normalizeOptionalText(draft.defaultModel),
      sandboxPolicy: normalizeOptionalText(draft.sandboxPolicy),
      approvalPolicy: normalizeOptionalText(draft.approvalPolicy),
      envVarWhitelist,
      workingDirStrategy: draft.workingDirStrategy,
      workingDir: normalizeOptionalText(draft.workingDir),
    };
    if (isCreating) {
      const created = await createExternalAgentConfig(payloadBase);
      if (created) {
        setIsCreating(false);
        setActiveId(created.id);
      }
      return;
    }
    if (!activeConfig) {
      return;
    }
    const updated = await updateExternalAgentConfig({
      config: {
        ...activeConfig,
        ...payloadBase,
      },
    });
    if (updated) {
      setActiveId(updated.id);
    }
  };

  const handleDelete = async () => {
    if (!activeConfig) {
      return;
    }
    const deleted = await deleteExternalAgentConfig({
      configId: activeConfig.id,
    });
    if (deleted) {
      setActiveId(null);
    }
  };

  const handleCancel = () => {
    if (isCreating) {
      setIsCreating(false);
      return;
    }
    if (activeConfig) {
      setDraft(buildExternalAgentConfigDraft(activeConfig));
    }
  };

  const handleFieldChange = (
    key: keyof ExternalAgentConfigDraft,
    value:
      | string
      | ExternalAgentToolTypeValue
      | ExternalAgentRunModeValue
      | ExternalAgentWorkingDirStrategyValue,
  ) => {
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      return { ...prev, [key]: value } as ExternalAgentConfigDraft;
    });
  };

  const isSaveDisabled = !canEdit || !draft;
  const isDeleteDisabled = !canEdit || !activeConfig || isCreating;
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
          New External Agent
        </button>
        {isCreating ? (
          <span className="text-xs text-setta-500 dark:text-setta-400">
            Creating a new external agent config.
          </span>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-col gap-3 @container @[42rem]:flex-row">
        <div className={`${listClassName} @[42rem]:w-64`}>
          {externalAgentConfigs.length === 0 ? (
            <div className="py-4 text-center text-xs text-setta-400">
              No external agents configured.
            </div>
          ) : (
            externalAgentConfigs.map((config) => {
              const isActive = config.id === activeId && !isCreating;
              let itemClassName =
                "rounded-md px-2 py-2 text-left text-xs transition-colors";
              if (isActive) {
                itemClassName +=
                  " bg-blue-600 text-white dark:bg-blue-700";
              } else {
                itemClassName +=
                  " hover:bg-setta-50 dark:hover:bg-setta-800/60";
              }
              return (
                <button
                  type="button"
                  key={config.id}
                  className={itemClassName}
                  onClick={() => {
                    if (isCreating) {
                      return;
                    }
                    setActiveId(config.id);
                  }}
                >
                  <p className="truncate font-semibold">
                    {config.name || "Untitled"}
                  </p>
                  <p className="truncate text-[11px] opacity-80">
                    {config.toolType} · {config.runMode}
                  </p>
                </button>
              );
            })
          )}
        </div>

        <div className={formClassName}>
          {!draft ? (
            <div className="text-xs text-setta-400">
              Select an external agent config to edit.
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
              <div className="grid gap-3 @[40rem]:grid-cols-2">
                <Field label="Tool Type">
                  <select
                    value={draft.toolType}
                    onChange={(event) =>
                      handleFieldChange(
                        "toolType",
                        event.target.value as ExternalAgentToolTypeValue,
                      )
                    }
                    className={SELECT_CLASS_NAME}
                    disabled={!canEdit}
                  >
                    {toolTypeOptions.map((option) => (
                      <option key={option} value={option}>
                        {option.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Run Mode">
                  <select
                    value={draft.runMode}
                    onChange={(event) =>
                      handleFieldChange(
                        "runMode",
                        event.target.value as ExternalAgentRunModeValue,
                      )
                    }
                    className={SELECT_CLASS_NAME}
                    disabled={!canEdit}
                  >
                    {runModeOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Command Path">
                <input
                  value={draft.commandPath}
                  onChange={(event) =>
                    handleFieldChange("commandPath", event.target.value)
                  }
                  className={INPUT_CLASS_NAME}
                  disabled={!canEdit}
                  placeholder="node"
                />
              </Field>
              <div className="grid gap-3 @[40rem]:grid-cols-2">
                <Field label="Base URL">
                  <input
                    value={draft.baseUrl}
                    onChange={(event) =>
                      handleFieldChange("baseUrl", event.target.value)
                    }
                    className={INPUT_CLASS_NAME}
                    disabled={!canEdit}
                    placeholder="http://localhost:3000"
                  />
                </Field>
                <Field label="Default Model">
                  <input
                    value={draft.defaultModel}
                    onChange={(event) =>
                      handleFieldChange("defaultModel", event.target.value)
                    }
                    className={INPUT_CLASS_NAME}
                    disabled={!canEdit}
                  />
                </Field>
              </div>
              <div className="grid gap-3 @[40rem]:grid-cols-2">
                <Field label="Sandbox Policy">
                  <input
                    value={draft.sandboxPolicy}
                    onChange={(event) =>
                      handleFieldChange("sandboxPolicy", event.target.value)
                    }
                    className={INPUT_CLASS_NAME}
                    disabled={!canEdit}
                  />
                </Field>
                <Field label="Approval Policy">
                  <input
                    value={draft.approvalPolicy}
                    onChange={(event) =>
                      handleFieldChange("approvalPolicy", event.target.value)
                    }
                    className={INPUT_CLASS_NAME}
                    disabled={!canEdit}
                  />
                </Field>
              </div>
              <Field
                label="Env Var Whitelist"
                hint="Names only, one per line."
              >
                <textarea
                  value={draft.envVarWhitelistText}
                  onChange={(event) =>
                    handleFieldChange(
                      "envVarWhitelistText",
                      event.target.value,
                    )
                  }
                  className={TEXTAREA_CLASS_NAME}
                  disabled={!canEdit}
                />
              </Field>
              <div className="grid gap-3 @[40rem]:grid-cols-2">
                <Field label="Working Dir Strategy">
                  <select
                    value={draft.workingDirStrategy}
                    onChange={(event) =>
                      handleFieldChange(
                        "workingDirStrategy",
                        event.target.value as ExternalAgentWorkingDirStrategyValue,
                      )
                    }
                    className={SELECT_CLASS_NAME}
                    disabled={!canEdit}
                  >
                    {workingDirOptions.map((option) => (
                      <option key={option} value={option}>
                        {option.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Working Dir">
                  <input
                    value={draft.workingDir}
                    onChange={(event) =>
                      handleFieldChange("workingDir", event.target.value)
                    }
                    className={INPUT_CLASS_NAME}
                    disabled={!canEdit}
                  />
                </Field>
              </div>

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
    llmConfigId: profile.llmConfigId ?? "",
    toolAllowlistText: (profile.toolAllowlist ?? []).join("\n"),
    memoryScope: profile.memoryScope ?? "",
  };
}

function buildPromptTemplateDraft(
  template: PromptTemplate,
): PromptTemplateDraft {
  return {
    name: template.name ?? "",
    description: template.description ?? "",
    template: template.template ?? "",
    format: template.format,
    inputSchemaText: JSON.stringify(template.inputSchema ?? {}, null, 2),
    metadataText: JSON.stringify(template.metadata ?? {}, null, 2),
  };
}

function buildExternalAgentConfigDraft(
  config: ExternalAgentConfig,
): ExternalAgentConfigDraft {
  return {
    name: config.name ?? "",
    description: config.description ?? "",
    toolType: config.toolType,
    runMode: config.runMode,
    commandPath: config.commandPath ?? "",
    baseUrl: config.baseUrl ?? "",
    defaultModel: config.defaultModel ?? "",
    sandboxPolicy: config.sandboxPolicy ?? "",
    approvalPolicy: config.approvalPolicy ?? "",
    envVarWhitelistText: (config.envVarWhitelist ?? []).join("\n"),
    workingDirStrategy: config.workingDirStrategy,
    workingDir: config.workingDir ?? "",
  };
}

function parseListInput(value: string): Array<string> {
  return value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function normalizeOptionalText(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed;
}

type JsonParseResult = {
  value: Record<string, unknown>;
  error: string | null;
};

function parseJsonObject(value: string): JsonParseResult {
  if (!value.trim()) {
    return { value: {}, error: null };
  }
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { value: {}, error: "JSON must be an object." };
    }
    return { value: parsed as Record<string, unknown>, error: null };
  } catch {
    return { value: {}, error: "Invalid JSON." };
  }
}
