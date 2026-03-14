import { buildLLMConfigGroups } from "components/Chat/llmConfigUtils";
import { IdNameCombobox } from "components/Utils/Combobox/IdNameCombobox";
import { useEffect, useMemo, useState } from "react";
import {
  createTranscriptionProfile,
  deleteTranscriptionProfile,
  updateTranscriptionProfile,
} from "state/actions/ai/projectAiResources";
import { useAIStore } from "state/definitions";
import { TranscriptionTransportModeEnum } from "utils/generatedTypes";
import { shallow } from "zustand/shallow";
import {
  type TranscriptionTransportModeValue,
  buildTranscriptionProfileDraft,
  resolveTranscriptionChunkMsForSave,
} from "./projectAISettingsDraftUtils";
import {
  Field,
  INPUT_CLASS_NAME,
  MANAGER_FORM_CLASS_NAME,
  MANAGER_LIST_CLASS_NAME,
  SELECT_CLASS_NAME,
} from "./projectAISettingsFormPrimitives";

export function ProjectAITranscriptionProfilesManager({
  canEdit,
}: {
  canEdit: boolean;
}) {
  const { apiKeys, allLLMConfigs, transcriptionProfiles } = useAIStore(
    (state) => ({
      apiKeys: state.apiKeys,
      allLLMConfigs: state.allLLMConfigs,
      transcriptionProfiles: state.transcriptionProfiles,
    }),
    shallow,
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [draft, setDraft] = useState<ReturnType<
    typeof buildTranscriptionProfileDraft
  > | null>(null);
  const transportModeOptions = useMemo(
    () => Object.values(TranscriptionTransportModeEnum),
    [],
  );
  const configGroups = useMemo(
    () =>
      buildLLMConfigGroups(allLLMConfigs, apiKeys, {
        includeConfigsWithoutApiKey: true,
      }),
    [allLLMConfigs, apiKeys],
  );
  const firstConfigId = useMemo(() => {
    for (const group of configGroups) {
      for (const item of group.items) {
        return item.id;
      }
    }
    return "";
  }, [configGroups]);

  useEffect(() => {
    if (isCreating) {
      return;
    }
    if (!activeId) {
      if (transcriptionProfiles.length > 0) {
        setActiveId(transcriptionProfiles[0].id);
      }
      return;
    }
    const exists = transcriptionProfiles.some(
      (profile) => profile.id === activeId,
    );
    if (!exists) {
      setActiveId(
        transcriptionProfiles.length > 0 ? transcriptionProfiles[0].id : null,
      );
    }
  }, [activeId, isCreating, transcriptionProfiles]);

  const activeProfile = useMemo(() => {
    if (!activeId) {
      return null;
    }
    return (
      transcriptionProfiles.find((profile) => profile.id === activeId) ?? null
    );
  }, [activeId, transcriptionProfiles]);

  useEffect(() => {
    if (isCreating) {
      setDraft({
        name: "",
        transcriptionLlmConfigId: firstConfigId,
        transportMode: TranscriptionTransportModeEnum.auto,
        chunkMs: "1200",
        language: "",
      });
      return;
    }
    if (!activeProfile) {
      setDraft(null);
      return;
    }
    setDraft(buildTranscriptionProfileDraft(activeProfile));
  }, [activeProfile, firstConfigId, isCreating]);

  const handleCreateClick = () => {
    if (!canEdit) {
      return;
    }
    setIsCreating(true);
    setActiveId(null);
  };

  const handleSave = async () => {
    if (!draft || !draft.transcriptionLlmConfigId) {
      return;
    }
    const resolvedChunkMs = resolveTranscriptionChunkMsForSave({
      transportMode: draft.transportMode,
      chunkMsInput: draft.chunkMs,
    });
    if (resolvedChunkMs === null) {
      return;
    }
    const trimmedName = draft.name.trim() || "Untitled";
    const normalizedLanguage = draft.language.trim() || null;
    if (isCreating) {
      const created = await createTranscriptionProfile({
        name: trimmedName,
        transcriptionLlmConfigId: draft.transcriptionLlmConfigId,
        transportMode: draft.transportMode,
        chunkMs: resolvedChunkMs,
        language: normalizedLanguage,
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
    const updated = await updateTranscriptionProfile({
      profile: {
        ...activeProfile,
        name: trimmedName,
        transcriptionLlmConfigId: draft.transcriptionLlmConfigId,
        transportMode: draft.transportMode,
        chunkMs: resolvedChunkMs,
        language: normalizedLanguage,
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
    const deleted = await deleteTranscriptionProfile({
      profileId: activeProfile.id,
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
    if (activeProfile) {
      setDraft(buildTranscriptionProfileDraft(activeProfile));
    }
  };

  const resolvedChunkMs = draft
    ? resolveTranscriptionChunkMsForSave({
        transportMode: draft.transportMode,
        chunkMsInput: draft.chunkMs,
      })
    : null;
  const isSaveDisabled =
    !canEdit ||
    !draft ||
    !draft.transcriptionLlmConfigId ||
    resolvedChunkMs === null;
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
            Creating a new transcription profile.
          </span>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-col gap-3 @container @[42rem]:flex-row">
        <div className={`${MANAGER_LIST_CLASS_NAME} @[42rem]:w-64`}>
          {transcriptionProfiles.length === 0 ? (
            <div className="py-4 text-center text-xs text-setta-400">
              No transcription profiles yet.
            </div>
          ) : (
            transcriptionProfiles.map((profile) => {
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
                  <p className="truncate text-[11px] opacity-80">
                    {profile.transcriptionLlmConfigId}
                    {" · "}
                    {profile.transportMode}
                  </p>
                </button>
              );
            })
          )}
        </div>
        <div className={MANAGER_FORM_CLASS_NAME}>
          {!draft ? (
            <div className="text-xs text-setta-400">
              Select a transcription profile to edit.
            </div>
          ) : (
            <>
              <Field label="Name">
                <input
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((prev) =>
                      prev ? { ...prev, name: event.target.value } : prev,
                    )
                  }
                  className={INPUT_CLASS_NAME}
                  disabled={!canEdit}
                />
              </Field>
              <Field
                label="Transcription LLM Config"
                hint={
                  configGroups.some((group) => group.items.length > 0)
                    ? "Choose the provider model used for transcription."
                    : "No LLM configs available. Add one in LLM API Keys first."
                }
              >
                <IdNameCombobox
                  allItems={configGroups}
                  value={draft.transcriptionLlmConfigId}
                  small={false}
                  onSelectedItemChange={(value) =>
                    setDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            transcriptionLlmConfigId: value ?? "",
                          }
                        : prev,
                    )
                  }
                  placeholder="Select a transcription config"
                  outerDivClasses="w-full"
                  isDisabled={!canEdit}
                />
              </Field>
              <div className="grid gap-3 @[40rem]:grid-cols-3">
                <Field
                  label="Transport Mode"
                  hint="Auto uses realtime when available, otherwise file windows."
                >
                  <select
                    value={draft.transportMode}
                    onChange={(event) =>
                      setDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              transportMode: event.target
                                .value as TranscriptionTransportModeValue,
                            }
                          : prev,
                      )
                    }
                    className={SELECT_CLASS_NAME}
                    disabled={!canEdit}
                  >
                    {transportModeOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="Chunk (ms)"
                  hint="Used for realtime transport chunking. File mode ignores this value."
                >
                  <input
                    value={draft.chunkMs}
                    onChange={(event) =>
                      setDraft((prev) =>
                        prev ? { ...prev, chunkMs: event.target.value } : prev,
                      )
                    }
                    className={INPUT_CLASS_NAME}
                    disabled={
                      !canEdit ||
                      draft.transportMode ===
                        TranscriptionTransportModeEnum.file
                    }
                  />
                </Field>
                <Field
                  label="Language"
                  hint="Optional ISO-639-1 hint, e.g. en."
                >
                  <input
                    value={draft.language}
                    onChange={(event) =>
                      setDraft((prev) =>
                        prev ? { ...prev, language: event.target.value } : prev,
                      )
                    }
                    className={INPUT_CLASS_NAME}
                    disabled={!canEdit}
                    placeholder="auto"
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
