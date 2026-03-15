import type {
  AppGenSkillContent,
  AppGenSkillEntry,
} from "utils/generatedTypes";

export const SKILL_MARKDOWN_VIEW_MODE_RENDERED = "rendered";
export const SKILL_MARKDOWN_VIEW_MODE_RAW = "raw";

export type SkillMarkdownViewMode =
  | typeof SKILL_MARKDOWN_VIEW_MODE_RENDERED
  | typeof SKILL_MARKDOWN_VIEW_MODE_RAW;
export type SkillContentLoadStatus = "idle" | "loading" | "loaded" | "error";
export type SkillMarkdownDraftStateEntry = {
  draft: string;
  loadedContent: string;
};

export type SkillContentCacheEntry = {
  content: string;
  truncated: boolean;
  originalSizeBytes: number | null;
};

type ResolveSkillMarkdownRawDraftBySkillIdHydrationInput = {
  skillMarkdownDraftStateBySkillId: Record<
    string,
    SkillMarkdownDraftStateEntry
  >;
  skillId: string;
  skillContent: string;
};

type ResolveSkillMarkdownRawDraftBySkillIdUpdateInput = {
  skillMarkdownDraftStateBySkillId: Record<
    string,
    SkillMarkdownDraftStateEntry
  >;
  skillId: string;
  nextRawDraft: string;
};

type ResolveSkillMarkdownRawDraftBySkillIdReplaceInput = {
  skillMarkdownDraftStateBySkillId: Record<
    string,
    SkillMarkdownDraftStateEntry
  >;
  skillId: string;
  nextRawDraft: string;
};

type ResolveSaveSelectedSkillButtonTitleInput = {
  selectedSkillId: string | null;
  selectedSkillIsEditable: boolean;
  selectedSkillEditabilityReason: string | null;
  selectedSkillContentTruncated: boolean;
  skillContentLoadStatus: SkillContentLoadStatus;
};

type ResolveRawMarkdownModeHintInput = ResolveSaveSelectedSkillButtonTitleInput;

type CanSaveSelectedSkillInput = {
  skillContentLoadStatus: SkillContentLoadStatus;
  selectedSkillIsEditable: boolean;
  selectedSkillId: string | null;
  skillMarkdownViewMode: SkillMarkdownViewMode;
  selectedSkillContentTruncated: boolean;
  skillMarkdownRawDraft: string | null;
  skillContentLoading: boolean;
  customSkillSaveInFlight: boolean;
};

export type SelectedSkillViewState = {
  selectedSkillId: string;
  selectedSkillContent: string;
  selectedSkillContentTruncated: boolean;
  selectedSkillOriginalSizeBytes: number | null;
};

function compareAppGenSkillEntries(
  first: AppGenSkillEntry,
  second: AppGenSkillEntry,
): number {
  const rootLabelComparison = first.rootLabel.localeCompare(second.rootLabel);
  if (rootLabelComparison !== 0) {
    return rootLabelComparison;
  }
  const relativePathComparison = first.relativePath.localeCompare(
    second.relativePath,
  );
  if (relativePathComparison !== 0) {
    return relativePathComparison;
  }
  return first.name.localeCompare(second.name);
}

export function upsertAppGenSkillEntry(
  skills: AppGenSkillEntry[],
  nextSkill: AppGenSkillEntry,
): AppGenSkillEntry[] {
  const existingIndex = skills.findIndex(
    (skill) => skill.skillId === nextSkill.skillId,
  );
  const nextSkills =
    existingIndex >= 0
      ? skills.map((skill, index) =>
          index === existingIndex ? nextSkill : skill,
        )
      : [...skills, nextSkill];
  return nextSkills.sort(compareAppGenSkillEntries);
}

export function resolveSkillMarkdownRawDraftBySkillIdHydration({
  skillMarkdownDraftStateBySkillId,
  skillId,
  skillContent,
}: ResolveSkillMarkdownRawDraftBySkillIdHydrationInput): Record<
  string,
  SkillMarkdownDraftStateEntry
> | null {
  const currentEntry = skillMarkdownDraftStateBySkillId[skillId];
  if (currentEntry) {
    if (currentEntry.loadedContent === skillContent) {
      return null;
    }
    if (currentEntry.draft !== currentEntry.loadedContent) {
      return {
        ...skillMarkdownDraftStateBySkillId,
        [skillId]: {
          ...currentEntry,
          loadedContent: skillContent,
        },
      };
    }
  }
  return {
    ...skillMarkdownDraftStateBySkillId,
    [skillId]: {
      draft: skillContent,
      loadedContent: skillContent,
    },
  };
}

export function resolveSkillMarkdownRawDraftBySkillIdReplace({
  skillMarkdownDraftStateBySkillId,
  skillId,
  nextRawDraft,
}: ResolveSkillMarkdownRawDraftBySkillIdReplaceInput): Record<
  string,
  SkillMarkdownDraftStateEntry
> | null {
  const currentEntry = skillMarkdownDraftStateBySkillId[skillId];
  if (
    currentEntry &&
    currentEntry.draft === nextRawDraft &&
    currentEntry.loadedContent === nextRawDraft
  ) {
    return null;
  }
  return {
    ...skillMarkdownDraftStateBySkillId,
    [skillId]: {
      draft: nextRawDraft,
      loadedContent: nextRawDraft,
    },
  };
}

export function resolveSelectedSkillViewStateAfterUpsertedSkillResponse({
  currentSelectedSkillId,
  requestSkillId,
  selectUpdatedSkill,
  skill,
  skillContent,
}: {
  currentSelectedSkillId: string | null;
  requestSkillId: string | null;
  selectUpdatedSkill: boolean;
  skill: AppGenSkillEntry;
  skillContent: AppGenSkillContent;
}): SelectedSkillViewState | null {
  if (!selectUpdatedSkill && currentSelectedSkillId !== requestSkillId) {
    return null;
  }
  return {
    selectedSkillId: skill.skillId,
    selectedSkillContent: skillContent.content,
    selectedSkillContentTruncated: skillContent.truncated,
    selectedSkillOriginalSizeBytes: skillContent.originalSizeBytes,
  };
}

export function resolveSkillMarkdownRawDraftBySkillIdUpdate({
  skillMarkdownDraftStateBySkillId,
  skillId,
  nextRawDraft,
}: ResolveSkillMarkdownRawDraftBySkillIdUpdateInput): Record<
  string,
  SkillMarkdownDraftStateEntry
> | null {
  const currentEntry = skillMarkdownDraftStateBySkillId[skillId];
  if (currentEntry?.draft === nextRawDraft) {
    return null;
  }
  return {
    ...skillMarkdownDraftStateBySkillId,
    [skillId]: {
      draft: nextRawDraft,
      loadedContent: currentEntry?.loadedContent ?? nextRawDraft,
    },
  };
}

export function isActionablePath(path: string | null): path is string {
  return typeof path === "string" && path.trim().length > 0;
}

export function canCreateCustomSkill({
  customSkillCreateInFlight,
  customSkillCreateRootPath,
  newCustomSkillRelativePath,
}: {
  customSkillCreateInFlight: boolean;
  customSkillCreateRootPath: string | null;
  newCustomSkillRelativePath: string;
}): boolean {
  return (
    !customSkillCreateInFlight &&
    !!customSkillCreateRootPath &&
    newCustomSkillRelativePath.trim().length > 0
  );
}

export function resolveSkillPreviewContent({
  skillContentLoading,
  skillsLoading,
  selectedSkillId,
  skillContentLoadStatus,
  selectedSkillContent,
}: {
  skillContentLoading: boolean;
  skillsLoading: boolean;
  selectedSkillId: string | null;
  skillContentLoadStatus: SkillContentLoadStatus;
  selectedSkillContent: string;
}): string {
  if (skillContentLoading || (skillsLoading && !selectedSkillId)) {
    return "Loading skill content...";
  }
  if (skillContentLoadStatus === "error") {
    return "Skill content unavailable.";
  }
  if (selectedSkillId && skillContentLoadStatus === "loaded") {
    return selectedSkillContent;
  }
  return "Select a skill to preview SKILL.md.";
}

export function resolveRenderedSkillPreviewContent({
  skillPreviewContent,
  skillMarkdownRawDraft,
  selectedSkillId,
  skillContentLoadStatus,
}: {
  skillPreviewContent: string;
  skillMarkdownRawDraft: string | null;
  selectedSkillId: string | null;
  skillContentLoadStatus: SkillContentLoadStatus;
}): string {
  if (
    selectedSkillId &&
    skillContentLoadStatus === "loaded" &&
    skillMarkdownRawDraft !== null
  ) {
    return skillMarkdownRawDraft;
  }
  return skillPreviewContent;
}

export function resolveSkillPreviewTruncationNotice({
  selectedSkillContentTruncated,
  selectedSkillOriginalSizeBytes,
}: {
  selectedSkillContentTruncated: boolean;
  selectedSkillOriginalSizeBytes: number | null;
}): string | null {
  if (
    !selectedSkillContentTruncated ||
    selectedSkillOriginalSizeBytes === null
  ) {
    return null;
  }
  return `Preview truncated from ${selectedSkillOriginalSizeBytes.toLocaleString()} bytes.`;
}

export function resolveRawMarkdownModeHint({
  selectedSkillId,
  selectedSkillIsEditable,
  selectedSkillEditabilityReason,
  selectedSkillContentTruncated,
  skillContentLoadStatus,
}: ResolveRawMarkdownModeHintInput): string {
  if (!selectedSkillId) {
    return "Read-only preview. Select a skill to edit.";
  }
  if (skillContentLoadStatus === "error") {
    return "Read-only preview. Resolve content loading errors before editing.";
  }
  if (skillContentLoadStatus !== "loaded") {
    return "Read-only preview. Skill content is still loading.";
  }
  if (!selectedSkillIsEditable) {
    return (
      selectedSkillEditabilityReason ??
      "Read-only preview. Select or create a custom skill to edit."
    );
  }
  if (selectedSkillContentTruncated) {
    return (
      "Preview is truncated. Full content loading is required before editing " +
      "or saving."
    );
  }
  return "Editing mode for custom skills.";
}

export function resolveSaveSelectedSkillButtonTitle({
  selectedSkillId,
  selectedSkillIsEditable,
  selectedSkillEditabilityReason,
  selectedSkillContentTruncated,
  skillContentLoadStatus,
}: ResolveSaveSelectedSkillButtonTitleInput): string {
  if (!selectedSkillId) {
    return "Select a skill to edit.";
  }
  if (skillContentLoadStatus === "error") {
    return "Cannot save while skill content failed to load.";
  }
  if (skillContentLoadStatus !== "loaded") {
    return "Skill content is still loading.";
  }
  if (!selectedSkillIsEditable) {
    return (
      selectedSkillEditabilityReason ?? "Only custom skills can be edited."
    );
  }
  if (selectedSkillContentTruncated) {
    return "Cannot save a truncated preview.";
  }
  return "Save selected custom skill";
}

export function canSaveSelectedSkill({
  skillContentLoadStatus,
  selectedSkillIsEditable,
  selectedSkillId,
  skillMarkdownViewMode,
  selectedSkillContentTruncated,
  skillMarkdownRawDraft,
  skillContentLoading,
  customSkillSaveInFlight,
}: CanSaveSelectedSkillInput): boolean {
  return (
    skillContentLoadStatus === "loaded" &&
    selectedSkillIsEditable &&
    !!selectedSkillId &&
    skillMarkdownViewMode === SKILL_MARKDOWN_VIEW_MODE_RAW &&
    !selectedSkillContentTruncated &&
    skillMarkdownRawDraft !== null &&
    !skillContentLoading &&
    !customSkillSaveInFlight
  );
}
