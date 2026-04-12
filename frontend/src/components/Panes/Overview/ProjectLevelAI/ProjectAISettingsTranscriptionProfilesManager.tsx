import { buildLLMConfigGroups } from "components/Chat/llmConfigUtils";
import { useCallback, useMemo, useState } from "react";
import {
  createTranscriptionProfile,
  deleteTranscriptionProfile,
  updateTranscriptionProfile,
} from "state/actions/ai";
import { useAIStore } from "state/definitions";
import { type TranscriptionProfile } from "utils/generatedTypes";
import { shallow } from "zustand/shallow";
import { useSelectableDraftManager } from "./projectAISettingsManagerState";
import {
  DANGER_ACTION_BUTTON_CLASS_NAME,
  Field,
  INPUT_CLASS_NAME,
  MANAGER_FORM_CLASS_NAME,
  MANAGER_LIST_CLASS_NAME,
  PRIMARY_ACTION_BUTTON_CLASS_NAME,
  SECONDARY_ACTION_BUTTON_CLASS_NAME,
  SELECT_CLASS_NAME,
  resolveManagerItemClassName,
} from "./projectAISettingsShared";
import {
  type TranscriptionProfileDraft,
  TranscriptionTransportModeEnum,
  buildTranscriptionProfileDraft,
  buildTranscriptionProfileSaveInput,
  createTranscriptionProfileDraft,
  resolveTranscriptionChunkMsForSave,
} from "./projectAISettingsTranscriptionProfiles";

export function TranscriptionProfilesManager({
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
  const [isCreating, setIsCreating] = useState(false);
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
  const buildNewDraft = useCallback(
    () => createTranscriptionProfileDraft(firstConfigId),
    [firstConfigId],
  );
  const buildExistingDraft = useCallback(
    (profile: TranscriptionProfile) => buildTranscriptionProfileDraft(profile),
    [],
  );
  const {
    activeId,
    setActiveId,
    activeItem: activeProfile,
    draft,
    setDraft,
  } = useSelectableDraftManager({
    items: transcriptionProfiles,
    isCreating,
    buildDraft: buildExistingDraft,
    buildNewDraft,
  });

  const saveInput = draft ? buildTranscriptionProfileSaveInput(draft) : null;
  const resolvedChunkMs = draft
    ? resolveTranscriptionChunkMsForSave({
        transportMode: draft.transportMode,
        chunkMsInput: draft.chunkMs,
      })
    : null;
  const isSaveDisabled = !canEdit || saveInput == null;
  const isDeleteDisabled = !canEdit || !activeProfile || isCreating;
  const isCancelDisabled = !draft;

  const handleCreateClick = () => {
    if (!canEdit) {
      return;
    }
    setIsCreating(true);
    setActiveId(null);
  };
  const handleSave = async () => {
    if (!saveInput) {
      return;
    }
    if (isCreating) {
      const created = await createTranscriptionProfile(saveInput);
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
        ...saveInput,
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
  const handleFieldChange = <K extends keyof TranscriptionProfileDraft>(
    key: K,
    value: TranscriptionProfileDraft[K],
  ) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className={SECONDARY_ACTION_BUTTON_CLASS_NAME}
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
        <TranscriptionProfilesList
          profiles={transcriptionProfiles}
          activeId={activeId}
          isCreating={isCreating}
          onSelect={setActiveId}
        />
        <TranscriptionProfileEditor
          canEdit={canEdit}
          draft={draft}
          configGroups={configGroups}
          transportModeOptions={transportModeOptions}
          resolvedChunkMs={resolvedChunkMs}
          isSaveDisabled={isSaveDisabled}
          isDeleteDisabled={isDeleteDisabled}
          isCancelDisabled={isCancelDisabled}
          onFieldChange={handleFieldChange}
          onSave={handleSave}
          onCancel={handleCancel}
          onDelete={handleDelete}
        />
      </div>
    </div>
  );
}

function TranscriptionProfilesList({
  profiles,
  activeId,
  isCreating,
  onSelect,
}: {
  profiles: Array<TranscriptionProfile>;
  activeId: string | null;
  isCreating: boolean;
  onSelect: (value: string | null) => void;
}) {
  return (
    <div className={`${MANAGER_LIST_CLASS_NAME} @[42rem]:w-64`}>
      {profiles.length === 0 ? (
        <div className="py-4 text-center text-xs text-setta-400">
          No transcription profiles yet.
        </div>
      ) : (
        profiles.map((profile) => (
          <button
            type="button"
            key={profile.id}
            className={resolveManagerItemClassName(
              profile.id === activeId && !isCreating,
            )}
            onClick={() => {
              if (isCreating) {
                return;
              }
              onSelect(profile.id);
            }}
          >
            <p className="truncate font-semibold">
              {profile.name || "Untitled"}
            </p>
            <p className="truncate text-[11px] opacity-80">
              {profile.transportMode}
            </p>
          </button>
        ))
      )}
    </div>
  );
}

function TranscriptionProfileEditor({
  canEdit,
  draft,
  configGroups,
  transportModeOptions,
  resolvedChunkMs,
  isSaveDisabled,
  isDeleteDisabled,
  isCancelDisabled,
  onFieldChange,
  onSave,
  onCancel,
  onDelete,
}: {
  canEdit: boolean;
  draft: TranscriptionProfileDraft | null;
  configGroups: ReturnType<typeof buildLLMConfigGroups>;
  transportModeOptions: Array<string>;
  resolvedChunkMs: number | null;
  isSaveDisabled: boolean;
  isDeleteDisabled: boolean;
  isCancelDisabled: boolean;
  onFieldChange: <K extends keyof TranscriptionProfileDraft>(
    key: K,
    value: TranscriptionProfileDraft[K],
  ) => void;
  onSave: () => Promise<void>;
  onCancel: () => void;
  onDelete: () => Promise<void>;
}) {
  if (!draft) {
    return (
      <div className={MANAGER_FORM_CLASS_NAME}>
        <div className="text-xs text-setta-400">
          Select a transcription profile to edit.
        </div>
      </div>
    );
  }
  const usesFileTransport =
    draft.transportMode === TranscriptionTransportModeEnum.file;
  return (
    <div className={MANAGER_FORM_CLASS_NAME}>
      <Field label="Name">
        <input
          value={draft.name}
          onChange={(event) => onFieldChange("name", event.target.value)}
          className={INPUT_CLASS_NAME}
          disabled={!canEdit}
        />
      </Field>
      <Field
        label="Provider LLM Config"
        hint="Used for provider-based transcription requests."
      >
        <select
          value={draft.transcriptionLlmConfigId}
          onChange={(event) =>
            onFieldChange("transcriptionLlmConfigId", event.target.value)
          }
          className={SELECT_CLASS_NAME}
          disabled={!canEdit}
        >
          <option value="">Select an LLM config</option>
          {configGroups.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </Field>
      <div className="grid gap-3 @[40rem]:grid-cols-2">
        <Field label="Transport Mode">
          <select
            value={draft.transportMode}
            onChange={(event) =>
              onFieldChange(
                "transportMode",
                event.target
                  .value as TranscriptionProfileDraft["transportMode"],
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
          label="Chunk Length (ms)"
          hint={
            usesFileTransport
              ? "File mode uses the backend default chunk size."
              : "Must be between 200 and 10000 ms."
          }
          error={
            !usesFileTransport && resolvedChunkMs === null
              ? "Invalid chunk length."
              : null
          }
        >
          <input
            value={draft.chunkMs}
            onChange={(event) => onFieldChange("chunkMs", event.target.value)}
            className={INPUT_CLASS_NAME}
            disabled={!canEdit || usesFileTransport}
          />
        </Field>
      </div>
      <Field label="Language">
        <input
          value={draft.language}
          onChange={(event) => onFieldChange("language", event.target.value)}
          className={INPUT_CLASS_NAME}
          disabled={!canEdit}
        />
      </Field>
      <div className="flex flex-wrap gap-2 pt-2">
        <button
          type="button"
          className={PRIMARY_ACTION_BUTTON_CLASS_NAME}
          onClick={() => void onSave()}
          disabled={isSaveDisabled}
        >
          Save
        </button>
        <button
          type="button"
          className={SECONDARY_ACTION_BUTTON_CLASS_NAME}
          onClick={onCancel}
          disabled={isCancelDisabled}
        >
          Cancel
        </button>
        <button
          type="button"
          className={DANGER_ACTION_BUTTON_CLASS_NAME}
          onClick={() => void onDelete()}
          disabled={isDeleteDisabled}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
