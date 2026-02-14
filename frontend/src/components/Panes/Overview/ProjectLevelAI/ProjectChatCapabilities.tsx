import {
  type DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getCurrProjectConfigId } from "state/actions/sectionInfos";
import { useShareSession } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import {
  route_delete_skills,
  route_get_project_chat_capability_policy,
  route_import_skill_markdown,
  route_set_project_chat_capability_policy,
} from "utils/generatedEndpoints";
import {
  CapabilityModeEnum,
  CapabilityPolicy,
  SkillEntry,
  createCapabilityPolicy,
} from "utils/generatedTypes";
import {
  createDefaultCapabilityPolicy,
  getCapabilityModeLabel,
  getUnavailableCapabilityIds,
  setCapabilityPolicyMode,
  toggleCapabilityMcpServerId,
  toggleCapabilitySkillId,
} from "./capabilitiesPolicyUtils";
import {
  CapabilitiesTab,
  CapabilitiesTabToggle,
  CapabilityMcpServerList,
  CapabilitySkillsList,
  CapabilityStateToggle,
} from "./CapabilitiesSharedControls";
import { useCapabilitiesCatalog } from "./useCapabilitiesCatalog";

type DroppedMarkdownFile = {
  label: string;
  markdown: string;
  slug: string | null;
};

type FileSystemEntryLike = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
};

type FileSystemFileEntryLike = FileSystemEntryLike & {
  isFile: true;
  file: (
    successCallback: (file: File) => void,
    errorCallback?: (error: DOMException) => void,
  ) => void;
};

type FileSystemDirectoryEntryLike = FileSystemEntryLike & {
  isDirectory: true;
  createReader: () => {
    readEntries: (
      successCallback: (entries: FileSystemEntryLike[]) => void,
      errorCallback?: (error: DOMException) => void,
    ) => void;
  };
};

type DataTransferItemWithEntry = DataTransferItem & {
  webkitGetAsEntry?: () => FileSystemEntryLike | null;
};

const SKILL_DOC_NAME_LOWER = "skill.md";
const WORKSPACE_SKILLS_SOURCE_ID = "workspace_skills";

function toSlugCandidate(rawPath: string): string | null {
  const normalized = rawPath
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/\.md$/i, "")
    .replace(/[^a-zA-Z0-9/_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-/_]+|[-/_]+$/g, "")
    .toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function readFileFromEntry(entry: FileSystemFileEntryLike): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
}

function readDirectoryBatch(
  directoryReader: ReturnType<FileSystemDirectoryEntryLike["createReader"]>,
): Promise<FileSystemEntryLike[]> {
  return new Promise((resolve, reject) => {
    directoryReader.readEntries(resolve, reject);
  });
}

async function readAllDirectoryEntries(
  directoryEntry: FileSystemDirectoryEntryLike,
): Promise<FileSystemEntryLike[]> {
  const directoryReader = directoryEntry.createReader();
  const allEntries: FileSystemEntryLike[] = [];
  while (true) {
    const batch = await readDirectoryBatch(directoryReader);
    if (batch.length === 0) {
      return allEntries;
    }
    allEntries.push(...batch);
  }
}

async function collectMarkdownFilesFromEntries(
  entries: FileSystemEntryLike[],
  parentSegments: string[],
): Promise<DroppedMarkdownFile[]> {
  const collected: DroppedMarkdownFile[] = [];
  for (const entry of entries) {
    if (entry.isFile) {
      const file = await readFileFromEntry(entry as FileSystemFileEntryLike);
      if (file.name.toLowerCase() !== SKILL_DOC_NAME_LOWER) {
        continue;
      }
      const relativePath = [...parentSegments, file.name].join("/");
      collected.push({
        label: relativePath,
        markdown: await file.text(),
        slug: toSlugCandidate(relativePath),
      });
      continue;
    }
    if (!entry.isDirectory) {
      continue;
    }
    const childEntries = await readAllDirectoryEntries(
      entry as FileSystemDirectoryEntryLike,
    );
    const nested = await collectMarkdownFilesFromEntries(childEntries, [
      ...parentSegments,
      entry.name,
    ]);
    collected.push(...nested);
  }
  return collected;
}

async function readDroppedMarkdownFiles(
  dataTransfer: DataTransfer,
): Promise<DroppedMarkdownFile[]> {
  const entries = Array.from(dataTransfer.items)
    .map(
      (item) =>
        (item as DataTransferItemWithEntry).webkitGetAsEntry?.() ?? null,
    )
    .filter((entry): entry is FileSystemEntryLike => entry !== null);
  if (entries.length > 0) {
    return collectMarkdownFilesFromEntries(entries, []);
  }
  const markdownFiles = Array.from(dataTransfer.files).filter(
    (file) => file.name.toLowerCase() === SKILL_DOC_NAME_LOWER,
  );
  return Promise.all(
    markdownFiles.map(async (file) => ({
      label: file.name,
      markdown: await file.text(),
      slug: toSlugCandidate(file.name),
    })),
  );
}

export function ProjectChatCapabilities({
  chatId,
}: {
  chatId: string | null | undefined;
}) {
  const projectConfigId = getCurrProjectConfigId();
  const { canEditParams } = useShareCapabilities();
  const isDeploymentMode = useShareSession((state) => state.isDeploymentMode);
  const canEditSettings = !isDeploymentMode || canEditParams;
  const {
    skills,
    sources,
    defaultValues,
    mcpServerIds,
    loading: catalogLoading,
    error: catalogError,
    refresh: refreshCatalog,
  } = useCapabilitiesCatalog();
  const [policy, setPolicy] = useState<CapabilityPolicy>(
    createDefaultCapabilityPolicy(),
  );
  const [loadingPolicy, setLoadingPolicy] = useState<boolean>(false);
  const [savingPolicy, setSavingPolicy] = useState<boolean>(false);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<CapabilitiesTab>("skills");
  const [skillMarkdownDraft, setSkillMarkdownDraft] = useState<string>("");
  const [skillSlugDraft, setSkillSlugDraft] = useState<string>("");
  const [isImportingSkill, setIsImportingSkill] = useState<boolean>(false);
  const [isDeletingSkills, setIsDeletingSkills] = useState<boolean>(false);
  const [skillMutationError, setSkillMutationError] = useState<string | null>(
    null,
  );
  const [skillDropActive, setSkillDropActive] = useState<boolean>(false);

  const loadPolicy = useCallback(async () => {
    setLoadingPolicy(true);
    try {
      const response = await route_get_project_chat_capability_policy({
        projectConfigId,
        chatId: chatId ?? null,
      });
      if (!res200(response)) {
        setPolicyError(
          getErrorDetail(response.data as unknown) ??
            "Failed to load project chat capabilities.",
        );
        return;
      }
      setPolicy(createCapabilityPolicy(response.data));
      setPolicyError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setPolicyError(message);
    } finally {
      setLoadingPolicy(false);
    }
  }, [chatId, projectConfigId]);

  useEffect(() => {
    void loadPolicy();
  }, [loadPolicy]);

  const persistPolicy = useCallback(
    async (nextPolicy: CapabilityPolicy) => {
      if (!canEditSettings) {
        return;
      }
      setPolicy(nextPolicy);
      setSavingPolicy(true);
      try {
        const response = await route_set_project_chat_capability_policy({
          projectConfigId,
          chatId: chatId ?? null,
          capabilityPolicy: nextPolicy,
        });
        if (!res200(response)) {
          setPolicyError(
            getErrorDetail(response.data as unknown) ??
              "Failed to save project chat capabilities.",
          );
          return;
        }
        setPolicy(createCapabilityPolicy(response.data));
        setPolicyError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setPolicyError(message);
      } finally {
        setSavingPolicy(false);
      }
    },
    [canEditSettings, chatId, projectConfigId],
  );

  const selectedSkillIds = useMemo(
    () =>
      policy.mode === CapabilityModeEnum.inherit
        ? [...defaultValues.defaultSkillIds]
        : [...policy.enabledSkillIds],
    [defaultValues.defaultSkillIds, policy.enabledSkillIds, policy.mode],
  );
  const selectedMcpServerIds = useMemo(
    () => [...policy.enabledMcpServerIds],
    [policy.enabledMcpServerIds],
  );
  const availableSkillIds = useMemo(
    () => new Set(skills.map((skill) => skill.id)),
    [skills],
  );
  const unavailableSkillIds = useMemo(
    () => getUnavailableCapabilityIds(selectedSkillIds, availableSkillIds),
    [availableSkillIds, selectedSkillIds],
  );
  const availableMcpServerIdSet = useMemo(
    () => new Set(mcpServerIds),
    [mcpServerIds],
  );
  const unavailableMcpServerIds = useMemo(
    () =>
      getUnavailableCapabilityIds(
        selectedMcpServerIds,
        availableMcpServerIdSet,
      ),
    [availableMcpServerIdSet, selectedMcpServerIds],
  );
  const sourceById = useMemo(
    () => new Map(sources.map((source) => [source.id, source])),
    [sources],
  );
  const isSkillDeletable = useCallback(
    (skill: SkillEntry): boolean => {
      const source = sourceById.get(skill.sourceId);
      if (!source) {
        return false;
      }
      return !source.builtin || source.id === WORKSPACE_SKILLS_SOURCE_ID;
    },
    [sourceById],
  );
  const modeLabel = useMemo(() => getCapabilityModeLabel(policy), [policy]);
  const capabilityErrors = useMemo(() => {
    const uniqueByKey: Record<string, string> = {};
    for (const error of [catalogError, policyError, skillMutationError]) {
      if (!error || error.trim().length === 0) {
        continue;
      }
      const normalized = error.trim();
      const dedupeKey = normalized.toLowerCase();
      if (!uniqueByKey[dedupeKey]) {
        uniqueByKey[dedupeKey] = normalized;
      }
    }
    return Object.values(uniqueByKey);
  }, [catalogError, policyError, skillMutationError]);
  const editablePolicyBaseline = useMemo<CapabilityPolicy>(() => {
    if (policy.mode === CapabilityModeEnum.inherit) {
      return {
        mode: CapabilityModeEnum.custom,
        enabledSkillIds: [...defaultValues.defaultSkillIds],
        enabledMcpServerIds: [...policy.enabledMcpServerIds],
      };
    }
    return {
      mode: CapabilityModeEnum.custom,
      enabledSkillIds: [...policy.enabledSkillIds],
      enabledMcpServerIds: [...policy.enabledMcpServerIds],
    };
  }, [
    defaultValues.defaultSkillIds,
    policy.enabledMcpServerIds,
    policy.enabledSkillIds,
    policy.mode,
  ]);

  const changeMode = useCallback(
    (mode: (typeof CapabilityModeEnum)[keyof typeof CapabilityModeEnum]) => {
      if (mode === CapabilityModeEnum.custom) {
        // Preserve the previously stored custom selection when switching back
        // from inherit/disabled into custom.
        void persistPolicy(setCapabilityPolicyMode(policy, mode));
        return;
      }
      void persistPolicy(setCapabilityPolicyMode(policy, mode));
    },
    [persistPolicy, policy],
  );

  const toggleSkill = useCallback(
    (skillId: string, selected: boolean) => {
      void persistPolicy(
        toggleCapabilitySkillId(editablePolicyBaseline, skillId, selected),
      );
    },
    [editablePolicyBaseline, persistPolicy],
  );

  const toggleMcpServer = useCallback(
    (serverId: string, selected: boolean) => {
      void persistPolicy(
        toggleCapabilityMcpServerId(policy, serverId, selected),
      );
    },
    [persistPolicy, policy],
  );

  const disableControls = loadingPolicy || savingPolicy || !canEditSettings;

  const importSkillMarkdown = useCallback(
    async (markdown: string, slug: string | null) => {
      if (!canEditSettings) {
        return;
      }
      const trimmedMarkdown = markdown.trim();
      if (!trimmedMarkdown) {
        setSkillMutationError("Skill markdown cannot be empty.");
        return;
      }
      setIsImportingSkill(true);
      try {
        const response = await route_import_skill_markdown({
          markdown: trimmedMarkdown,
          slug: slug && slug.trim().length > 0 ? slug.trim() : null,
          sourceId: null,
        });
        if (!res200(response)) {
          setSkillMutationError(
            getErrorDetail(response.data as unknown) ??
              "Failed to import skill markdown.",
          );
          return;
        }
        setSkillMutationError(null);
        setSkillMarkdownDraft("");
        setSkillSlugDraft("");
        await refreshCatalog();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setSkillMutationError(message);
      } finally {
        setIsImportingSkill(false);
      }
    },
    [canEditSettings, refreshCatalog],
  );

  const handleDropSkillFiles = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setSkillDropActive(false);
      if (!canEditSettings) {
        return;
      }
      const droppedMarkdownFiles = await readDroppedMarkdownFiles(
        event.dataTransfer,
      );
      if (droppedMarkdownFiles.length === 0) {
        setSkillMutationError("Drop at least one SKILL.md file or folder.");
        return;
      }
      setIsImportingSkill(true);
      setSkillMutationError(null);
      try {
        for (const droppedFile of droppedMarkdownFiles) {
          const response = await route_import_skill_markdown({
            markdown: droppedFile.markdown,
            slug: droppedFile.slug,
            sourceId: null,
          });
          if (!res200(response)) {
            setSkillMutationError(
              getErrorDetail(response.data as unknown) ??
                `Failed to import ${droppedFile.label}.`,
            );
            return;
          }
        }
        await refreshCatalog();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setSkillMutationError(message);
      } finally {
        setIsImportingSkill(false);
      }
    },
    [canEditSettings, refreshCatalog],
  );

  const handleDeleteSkill = useCallback(
    async (skillId: string) => {
      if (!canEditSettings) {
        return;
      }
      const skill = skills.find((entry) => entry.id === skillId);
      if (!skill || !isSkillDeletable(skill)) {
        setSkillMutationError(
          "Only workspace or custom-source skills can be deleted.",
        );
        return;
      }
      setIsDeletingSkills(true);
      try {
        const response = await route_delete_skills({
          skillRefs: [skillId],
        });
        if (!res200(response)) {
          setSkillMutationError(
            getErrorDetail(response.data as unknown) ??
              "Failed to delete skill.",
          );
          return;
        }
        const deletedSkillIds = new Set(response.data);
        setSkillMutationError(null);
        await refreshCatalog();
        if (policy.mode === CapabilityModeEnum.custom) {
          const nextEnabledSkills = policy.enabledSkillIds.filter(
            (skillId) => !deletedSkillIds.has(skillId),
          );
          if (nextEnabledSkills.length !== policy.enabledSkillIds.length) {
            void persistPolicy({
              mode: policy.mode,
              enabledSkillIds: nextEnabledSkills,
              enabledMcpServerIds: [...policy.enabledMcpServerIds],
            });
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setSkillMutationError(message);
      } finally {
        setIsDeletingSkills(false);
      }
    },
    [
      canEditSettings,
      isSkillDeletable,
      persistPolicy,
      policy.enabledMcpServerIds,
      policy.enabledSkillIds,
      policy.mode,
      refreshCatalog,
      skills,
    ],
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-4 @container">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-setta-600 dark:text-setta-300">
            Project Chat Capabilities
          </p>
          <p className="mt-1 text-[11px] text-setta-500 dark:text-setta-400">
            Configure skills and MCP servers for this project chat context.
          </p>
        </div>
        <button
          type="button"
          className="rounded border border-setta-300 px-2 py-1 text-[11px] font-semibold text-setta-600 hover:border-setta-400 disabled:cursor-not-allowed disabled:opacity-70 dark:border-setta-700 dark:text-setta-300"
          onClick={() => {
            void refreshCatalog();
            void loadPolicy();
          }}
          disabled={catalogLoading || loadingPolicy}
        >
          Refresh
        </button>
      </div>

      <CapabilitiesTabToggle activeTab={activeTab} onChange={setActiveTab} />

      {capabilityErrors.map((error) => (
        <p key={error} className="text-[11px] text-red-600 dark:text-red-400">
          {error}
        </p>
      ))}

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {activeTab === "skills" ? (
          <div className="flex min-h-0 flex-col gap-3">
            <div className="flex flex-col gap-2">
              <p className="text-[11px] text-setta-500 dark:text-setta-400">
                Skill state: {modeLabel}
              </p>
              <p className="text-[10px] text-setta-500 dark:text-setta-400">
                Disabled, Inherit, and Custom are skill states, not tabs.
              </p>
              <CapabilityStateToggle
                mode={policy.mode}
                onChange={changeMode}
                disabled={disableControls}
              />
              {policy.mode === CapabilityModeEnum.inherit ? (
                <div className="rounded-md border border-setta-200/80 bg-white/80 p-3 text-[11px] text-setta-500 dark:border-setta-700/60 dark:bg-setta-900/70 dark:text-setta-400">
                  <p>
                    Global skills:{" "}
                    {defaultValues.defaultSkillIds.length > 0
                      ? defaultValues.defaultSkillIds.join(", ")
                      : "none"}
                  </p>
                </div>
              ) : null}
            </div>
            {policy.mode === CapabilityModeEnum.disabled ? (
              <div className="flex flex-col gap-2 rounded-md border border-setta-200/70 bg-white/70 p-3 text-[11px] dark:border-setta-800 dark:bg-setta-900/40">
                <p className="text-setta-500 dark:text-setta-400">
                  Skills are disabled for this chat.
                </p>
                <button
                  type="button"
                  className="h-7 w-fit rounded-md border border-setta-300 px-2 text-[11px] font-semibold text-setta-700 hover:border-setta-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-700 dark:text-setta-200"
                  onClick={() => changeMode(CapabilityModeEnum.custom)}
                  disabled={disableControls}
                >
                  Enable Custom Skills
                </button>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  <p className="text-[11px] font-semibold text-setta-600 dark:text-setta-300">
                    Import Skill
                  </p>
                  <div
                    className={`rounded-md border px-2 py-2 transition-colors ${
                      skillDropActive
                        ? "border-blue-500 bg-blue-50/80 dark:border-blue-400 dark:bg-blue-950/30"
                        : "border-setta-300/80 bg-white/70 dark:border-setta-700/70 dark:bg-setta-900/60"
                    }`}
                    onDragOver={(event) => {
                      if (!event.dataTransfer.types.includes("Files")) {
                        return;
                      }
                      event.preventDefault();
                      setSkillDropActive(true);
                    }}
                    onDragLeave={() => setSkillDropActive(false)}
                    onDrop={(event) => {
                      void handleDropSkillFiles(event);
                    }}
                  >
                    <textarea
                      className="h-24 w-full resize-y bg-transparent text-[11px] text-setta-700 outline-none placeholder:text-setta-500 focus:outline-none dark:text-setta-200 dark:placeholder:text-setta-400"
                      placeholder="Paste skill markdown here, or drag/drop a .md file or folder into this box."
                      value={skillMarkdownDraft}
                      onChange={(event) =>
                        setSkillMarkdownDraft(event.target.value)
                      }
                      disabled={disableControls || isImportingSkill}
                    />
                  </div>
                  <p className="text-[10px] text-setta-500 dark:text-setta-400">
                    Pasted markdown imports one skill. Dropping files/folders
                    imports every discovered `SKILL.md`.
                  </p>
                  <div className="flex flex-col gap-2 @[16rem]:flex-row @[16rem]:items-center">
                    <input
                      className="h-7 min-w-0 flex-1 rounded-md border border-setta-200 bg-white px-2 text-[11px] text-setta-700 outline-none focus:border-blue-500 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200"
                      placeholder="Optional folder slug (e.g. repo-skill)"
                      value={skillSlugDraft}
                      onChange={(event) =>
                        setSkillSlugDraft(event.target.value)
                      }
                      disabled={disableControls || isImportingSkill}
                    />
                    <button
                      type="button"
                      className="h-7 rounded-md border border-setta-300 px-2 text-[11px] font-semibold text-setta-700 hover:border-setta-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-700 dark:text-setta-200"
                      onClick={() => {
                        void importSkillMarkdown(
                          skillMarkdownDraft,
                          skillSlugDraft || null,
                        );
                      }}
                      disabled={
                        disableControls ||
                        isImportingSkill ||
                        skillMarkdownDraft.trim().length === 0
                      }
                    >
                      Import
                    </button>
                  </div>
                </div>

                <p className="mb-2 text-[11px] font-semibold text-setta-600 dark:text-setta-300">
                  Skills ({sources.length} sources)
                </p>
                <p className="mb-2 text-[10px] text-setta-500 dark:text-setta-400">
                  Left checkbox toggles this chat capability.
                </p>
                <CapabilitySkillsList
                  skills={skills}
                  selectedSkillIds={selectedSkillIds}
                  onToggleSkill={toggleSkill}
                  isDisabled={disableControls}
                  emptyMessage="No skills found."
                  maxHeightClassName="max-h-64"
                  renderRowAction={(skill) =>
                    isSkillDeletable(skill) ? (
                      <button
                        type="button"
                        className="ml-auto inline-flex h-6 w-6 flex-none items-center justify-center rounded text-setta-400 hover:bg-red-500/10 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-setta-500 dark:hover:text-red-400"
                        title="Delete skill"
                        onClick={() => {
                          void handleDeleteSkill(skill.id);
                        }}
                        disabled={disableControls || isDeletingSkills}
                      >
                        <i className="gg-trash" />
                      </button>
                    ) : null
                  }
                />
              </>
            )}
          </div>
        ) : (
          <div className="min-h-0">
            <p className="mb-2 text-[11px] font-semibold text-setta-600 dark:text-setta-300">
              MCP Servers
            </p>
            <CapabilityMcpServerList
              serverIds={mcpServerIds}
              selectedIds={selectedMcpServerIds}
              onToggleServer={toggleMcpServer}
              isDisabled={disableControls}
              emptyMessage="No MCP servers configured."
              maxHeightClassName="max-h-64"
            />
          </div>
        )}
      </div>

      {policy.mode !== CapabilityModeEnum.disabled &&
      unavailableSkillIds.length > 0 ? (
        <p className="text-[11px] text-amber-700 dark:text-amber-300">
          Unavailable selected skills: {unavailableSkillIds.join(", ")}
        </p>
      ) : null}
      {unavailableMcpServerIds.length > 0 ? (
        <p className="text-[11px] text-amber-700 dark:text-amber-300">
          Unavailable selected MCP servers: {unavailableMcpServerIds.join(", ")}
        </p>
      ) : null}
    </div>
  );
}
