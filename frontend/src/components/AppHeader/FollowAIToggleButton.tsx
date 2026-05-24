import { NavbarMenuDropdown } from "components/Utils/atoms/menubar/menudropdown";
import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import _ from "lodash";
import { useMemo } from "react";
import { RiCheckLine, RiFocus2Line } from "react-icons/ri";
import { useAIFollow, useAIStore, useProjectState } from "state/definitions";
import type { AIFollowMode } from "state/types/aiFollow";
import { APP_MENU_Z_INDEX_CLASS_NAME } from "utils/constants";
import {
  SectionTypeEnum,
  type BaseSectionImplUnion,
  type ChatSectionImpl,
  type Core,
  type Variant,
} from "utils/generatedTypes";

type FollowAIToggleButtonProps = {
  labelMode?: "responsive" | "always";
  triggerClassName?: string | undefined;
};

type FollowEntryKind = "chat" | "section";

type FollowEntry = {
  id: string;
  label: string;
  kind: FollowEntryKind;
  key: string;
};

type AIFollowState = ReturnType<typeof useAIFollow.getState>;
type SectionVariantMap = Record<string, string>;
type SectionVariantEntry = Pick<Variant, "impl">;
type SectionImplEntry = Pick<BaseSectionImplUnion, "type"> &
  Partial<Pick<ChatSectionImpl, "chatId">>;
type SectionCoreEntry = Pick<Core, "displayName" | "name">;

const DEFAULT_TRIGGER_CLASS_NAME =
  "nodrag relative inline-flex h-full cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-1 text-xs font-semibold transition-colors focus-visible:ring-2 active:!bg-transparent active:text-setta-500 dark:hover:bg-transparent active:dark:text-setta-300";
const ACTIVE_TRIGGER_CLASS_NAME =
  "text-blue-600 hover:text-blue-500 dark:hover:text-blue-500";
const INACTIVE_TRIGGER_CLASS_NAME =
  "text-setta-600 hover:text-setta-900 dark:text-setta-300 dark:hover:text-white";
const MENU_ITEM_CLASSES =
  "mx-1 flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-xs text-setta-700 hover:bg-setta-600 hover:text-white active:bg-blue-100 dark:text-setta-200 dark:hover:bg-setta-900 dark:hover:text-white active:dark:bg-blue-950";
const MENU_DIVIDER_CLASS_NAME = "my-1 h-px bg-setta-100 dark:bg-setta-700/70";

const FOLLOW_MODE_ITEMS: ReadonlyArray<{
  label: string;
  mode: AIFollowMode;
}> = [
  { label: "Off", mode: "off" },
  { label: "Follow all", mode: "all" },
  { label: "Follow selected", mode: "selected" },
];

function getTriggerClassName(
  mode: AIFollowMode,
  triggerClassName?: string,
): string {
  const stateClasses =
    mode === "off" ? INACTIVE_TRIGGER_CLASS_NAME : ACTIVE_TRIGGER_CLASS_NAME;
  return `${triggerClassName ?? DEFAULT_TRIGGER_CLASS_NAME} ${stateClasses}`;
}

function getFollowEntryCheckClassName(isSelected: boolean): string {
  return `h-3 w-3 ${isSelected ? "opacity-100" : "opacity-0"}`;
}

function buildProjectChatEntry(
  activeChatId: string | null | undefined,
): FollowEntry | null {
  if (typeof activeChatId !== "string" || !activeChatId.trim()) {
    return null;
  }
  return {
    id: activeChatId,
    label: `Project chat (${activeChatId.slice(0, 8)})`,
    kind: "chat",
    key: `chat:${activeChatId}`,
  };
}

function getSectionFollowLabel(
  sectionId: string,
  core: SectionCoreEntry,
  chatId: string | null | undefined,
): string {
  const baseLabel = core.displayName?.trim() || core.name || "Chat";
  const sectionLabel = `${baseLabel} (${sectionId.slice(0, 8)})`;
  if (typeof chatId === "string" && chatId.trim()) {
    return sectionLabel;
  }
  return `${sectionLabel} (not started)`;
}

function buildSectionFollowEntry(
  sectionId: string,
  core: SectionCoreEntry,
  sectionVariantMap: SectionVariantMap,
  sectionVariants: Record<string, SectionVariantEntry | undefined>,
  sectionImpls: Record<string, SectionImplEntry | undefined>,
): FollowEntry | null {
  const variantId = sectionVariantMap[sectionId];
  if (!variantId) {
    return null;
  }
  const variant = sectionVariants[variantId];
  if (!variant) {
    return null;
  }
  const impl = sectionImpls[variant.impl];
  if (!impl || impl.type !== SectionTypeEnum.Chat) {
    return null;
  }
  return {
    id: sectionId,
    label: getSectionFollowLabel(sectionId, core, impl.chatId),
    kind: "section",
    key: `section:${sectionId}`,
  };
}

function buildFollowEntries(
  activeChatId: string | null | undefined,
  sections: Record<string, SectionCoreEntry>,
  sectionVariantMap: SectionVariantMap,
  sectionVariants: Record<string, SectionVariantEntry | undefined>,
  sectionImpls: Record<string, SectionImplEntry | undefined>,
): Array<FollowEntry> {
  const entries: Array<FollowEntry> = [];
  const projectChatEntry = buildProjectChatEntry(activeChatId);
  if (projectChatEntry) {
    entries.push(projectChatEntry);
  }
  for (const [sectionId, core] of Object.entries(sections)) {
    const sectionEntry = buildSectionFollowEntry(
      sectionId,
      core,
      sectionVariantMap,
      sectionVariants,
      sectionImpls,
    );
    if (sectionEntry) {
      entries.push(sectionEntry);
    }
  }
  return _.uniqBy(entries, (entry) => entry.key);
}

function buildSelectedEntrySets(
  selectedChatIds: Array<string>,
  selectedSectionIds: Array<string>,
): Record<FollowEntryKind, Set<string>> {
  return {
    chat: new Set(selectedChatIds),
    section: new Set(selectedSectionIds),
  };
}

function getSelectedIdsForEntry(
  state: AIFollowState,
  projectConfigId: string,
  kind: FollowEntryKind,
): Array<string> {
  if (kind === "chat") {
    return (
      state.selectedChatIdsByProjectConfigId[projectConfigId] ??
      (state.selectedChatIdsByProjectConfigId[projectConfigId] = [])
    );
  }
  return (
    state.selectedSectionIdsByProjectConfigId[projectConfigId] ??
    (state.selectedSectionIdsByProjectConfigId[projectConfigId] = [])
  );
}

function toggleSelectedId(selectedIds: Array<string>, id: string): void {
  const existingIndex = selectedIds.indexOf(id);
  if (existingIndex === -1) {
    selectedIds.push(id);
    return;
  }
  selectedIds.splice(existingIndex, 1);
}

function setFollowMode(mode: AIFollowMode): void {
  useAIFollow.setState((state) => {
    state.mode = mode;
  });
}

function toggleFollowEntrySelection(
  projectConfigId: string,
  entry: FollowEntry,
): void {
  useAIFollow.setState((state) => {
    const selectedIds = getSelectedIdsForEntry(
      state,
      projectConfigId,
      entry.kind,
    );
    toggleSelectedId(selectedIds, entry.id);
    state.mode = "selected";
  });
}

function clearFollowSelection(projectConfigId: string): void {
  useAIFollow.setState((state) => {
    state.selectedChatIdsByProjectConfigId[projectConfigId] = [];
    state.selectedSectionIdsByProjectConfigId[projectConfigId] = [];
  });
}

function FollowMenuTrigger({
  showResponsiveLabel,
}: {
  showResponsiveLabel: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <RiFocus2Line size={15} aria-hidden="true" />
      <span
        className={showResponsiveLabel ? "hidden @[31.25rem]:block" : undefined}
        data-testid="follow-ai-visible-label"
      >
        Follow AI
      </span>
      <span
        className={
          showResponsiveLabel ? "sr-only @[31.25rem]:hidden" : "sr-only"
        }
      >
        Follow AI
      </span>
    </span>
  );
}

function FollowModeMenuItem({
  currentMode,
  mode,
  label,
  shortcut,
}: {
  currentMode: AIFollowMode;
  mode: AIFollowMode;
  label: string;
  shortcut?: string | undefined;
}) {
  return (
    <MenuItem
      className={MENU_ITEM_CLASSES}
      shortcut={shortcut ?? ""}
      onClick={() => {
        setFollowMode(mode);
      }}
    >
      <RiCheckLine
        className={getFollowEntryCheckClassName(currentMode === mode)}
      />
      {label}
    </MenuItem>
  );
}

function FollowEntryMenuItem({
  entry,
  isSelected,
  projectConfigId,
}: {
  entry: FollowEntry;
  isSelected: boolean;
  projectConfigId: string;
}) {
  return (
    <MenuItem
      className={MENU_ITEM_CLASSES}
      onClick={() => {
        toggleFollowEntrySelection(projectConfigId, entry);
      }}
    >
      <RiCheckLine className={getFollowEntryCheckClassName(isSelected)} />
      {entry.label}
    </MenuItem>
  );
}

export function FollowAIToggleButton({
  labelMode = "responsive",
  triggerClassName,
}: FollowAIToggleButtonProps = {}) {
  const projectConfigId = useProjectState((state) => state.projectConfig.id);
  const {
    mode,
    selectedChatIdsByProjectConfigId,
    selectedSectionIdsByProjectConfigId,
  } = useAIFollow(
    (state) => ({
      mode: state.mode,
      selectedChatIdsByProjectConfigId: state.selectedChatIdsByProjectConfigId,
      selectedSectionIdsByProjectConfigId:
        state.selectedSectionIdsByProjectConfigId,
    }),
    _.isEqual,
  );
  const activeChatId = useAIStore((state) => state.activeChatId);
  const { sections, sectionVariants, sectionImpls, sectionVariantMap } =
    useProjectState(
      (state) => ({
        sections: state.sections,
        sectionVariants: state.sectionVariants,
        sectionImpls: state.sectionImpls,
        sectionVariantMap: state.projectConfig.sectionVariantMap,
      }),
      _.isEqual,
    );
  const selectedChatIds =
    selectedChatIdsByProjectConfigId[projectConfigId] ?? [];
  const selectedSectionIds =
    selectedSectionIdsByProjectConfigId[projectConfigId] ?? [];
  const selectedChatIdsKey = selectedChatIds.join("|");
  const selectedSectionIdsKey = selectedSectionIds.join("|");
  const selectedEntrySets = useMemo(
    () => buildSelectedEntrySets(selectedChatIds, selectedSectionIds),
    [selectedChatIdsKey, selectedSectionIdsKey],
  );
  const selectedCount = selectedChatIds.length + selectedSectionIds.length;
  const showResponsiveLabel = labelMode === "responsive";

  const followEntries = useMemo(
    () =>
      buildFollowEntries(
        activeChatId,
        sections,
        sectionVariantMap,
        sectionVariants,
        sectionImpls,
      ),
    [activeChatId, sections, sectionImpls, sectionVariantMap, sectionVariants],
  );

  return (
    <NavbarMenuDropdown
      trigger={<FollowMenuTrigger showResponsiveLabel={showResponsiveLabel} />}
      triggerClassName={getTriggerClassName(mode, triggerClassName)}
      contentClassName={`${APP_MENU_Z_INDEX_CLASS_NAME} min-w-[220px] rounded-md border border-solid border-setta-100 bg-white p-1 shadow-xl transition-all will-change-[transform,opacity] dark:border-setta-700/50 dark:bg-setta-850`}
    >
      {FOLLOW_MODE_ITEMS.map((item) => (
        <FollowModeMenuItem
          key={item.mode}
          currentMode={mode}
          mode={item.mode}
          label={item.label}
          shortcut={
            item.mode === "selected" && selectedCount > 0
              ? String(selectedCount)
              : undefined
          }
        />
      ))}
      <div className={MENU_DIVIDER_CLASS_NAME} />
      {followEntries.length === 0 ? (
        <MenuItem className={MENU_ITEM_CLASSES} disabled>
          No chats yet
        </MenuItem>
      ) : (
        followEntries.map((entry) => (
          <FollowEntryMenuItem
            key={entry.key}
            entry={entry}
            isSelected={selectedEntrySets[entry.kind].has(entry.id)}
            projectConfigId={projectConfigId}
          />
        ))
      )}
      {selectedCount > 0 ? (
        <>
          <div className={MENU_DIVIDER_CLASS_NAME} />
          <MenuItem
            className={MENU_ITEM_CLASSES}
            onClick={() => {
              clearFollowSelection(projectConfigId);
            }}
          >
            Clear selection
          </MenuItem>
        </>
      ) : null}
    </NavbarMenuDropdown>
  );
}
