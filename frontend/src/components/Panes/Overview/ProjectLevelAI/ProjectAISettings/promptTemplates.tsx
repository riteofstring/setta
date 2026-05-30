import { type ChangeEvent, useEffect, useMemo, useState } from "react";

import {
  createPromptTemplate,
  deletePromptTemplate,
  updatePromptTemplate,
} from "state/actions/ai";

import { useAIStore } from "state/definitions";

import { AgentProfile, FormatEnum, Template } from "utils/generatedTypes";

import { shallow } from "zustand/shallow";

import {
  Field,
  INPUT_CLASS_NAME,
  MANAGER_FORM_CLASS_NAME,
  MANAGER_LIST_CLASS_NAME,
  SELECT_CLASS_NAME,
  TEXTAREA_CLASS_NAME,
} from "../projectAISettingsShared";

import {
  AgentProfileDraft,
  PromptFormatValue,
  PromptTemplateDraft,
} from "./agentProfiles";

export function PromptTemplatesManager({ canEdit }: { canEdit: boolean }) {
  const { promptTemplates } = useAIStore(
    (state) => ({ promptTemplates: state.promptTemplates }),
    shallow,
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [draft, setDraft] = useState<PromptTemplateDraft | null>(null);
  const [inputSchemaError, setInputSchemaError] = useState<string | null>(null);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const formatOptions = useMemo(() => Object.values(FormatEnum), []);
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
        format: FormatEnum.Jinja,
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
  const listClassName = MANAGER_LIST_CLASS_NAME;
  const formClassName = MANAGER_FORM_CLASS_NAME;
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
                itemClassName += " bg-blue-600 text-white dark:bg-blue-700";
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

export function buildAgentProfileDraft(
  profile: AgentProfile,
): AgentProfileDraft {
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

export function buildPromptTemplateDraft(
  template: Template,
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

export type JsonParseResult = {
  value: Record<string, unknown>;
  error: string | null;
};

export function parseJsonObject(value: string): JsonParseResult {
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
