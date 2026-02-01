import { NavbarMenuDropdown } from "components/Utils/atoms/menubar/menudropdown";
import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import _ from "lodash";
import { useMemo } from "react";
import { RiCheckLine, RiFocus2Line } from "react-icons/ri";
import { useAIFollow, useAIStore, useProjectState } from "state/definitions";
import { SectionTypeEnum } from "utils/generatedTypes";

export function FollowAIToggleButton() {
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
  const selectedChatSet = useMemo(
    () => new Set(selectedChatIds),
    [selectedChatIdsKey],
  );
  const selectedSectionSet = useMemo(
    () => new Set(selectedSectionIds),
    [selectedSectionIdsKey],
  );
  const selectedCount = selectedChatIds.length + selectedSectionIds.length;
  const stateClasses =
    mode !== "off"
      ? "text-blue-600 hover:text-blue-500 dark:text-blue-400"
      : "text-setta-700 hover:text-setta-900 dark:text-setta-100";
  const menuItemClasses =
    "flex items-center gap-2 px-1.5 py-1.5 text-xs text-setta-700 dark:text-setta-200 mx-1 rounded-md text-left hover:bg-setta-600 hover:text-white dark:hover:bg-setta-900 dark:hover:text-white active:bg-blue-100 active:dark:bg-blue-950 cursor-pointer";

  const followEntries = useMemo(() => {
    type FollowEntry = {
      id: string;
      label: string;
      kind: "chat" | "section";
      key: string;
    };
    const entries: Array<FollowEntry> = [];
    if (typeof activeChatId === "string" && activeChatId.trim()) {
      entries.push({
        id: activeChatId,
        label: `Project chat (${activeChatId.slice(0, 8)})`,
        kind: "chat",
        key: `chat:${activeChatId}`,
      });
    }
    for (const [sectionId, core] of Object.entries(sections)) {
      const variantId = sectionVariantMap[sectionId];
      if (!variantId) {
        continue;
      }
      const variant = sectionVariants[variantId];
      if (!variant) {
        continue;
      }
      const impl = sectionImpls[variant.impl];
      if (!impl || impl.type !== SectionTypeEnum.Chat) {
        continue;
      }
      const chatId = impl.chatId;
      let baseLabel = "Chat";
      const displayName = core.displayName?.trim();
      if (displayName) {
        baseLabel = displayName;
      } else if (core.name) {
        baseLabel = core.name;
      }
      const shortSectionId = sectionId.slice(0, 8);
      let label = `${baseLabel} (${shortSectionId})`;
      if (typeof chatId !== "string" || !chatId.trim()) {
        label = `${label} (not started)`;
      }
      entries.push({
        id: sectionId,
        label,
        kind: "section",
        key: `section:${sectionId}`,
      });
    }
    return _.uniqBy(entries, (entry) => entry.key);
  }, [
    activeChatId,
    sections,
    sectionImpls,
    sectionVariantMap,
    sectionVariants,
  ]);

  return (
    <NavbarMenuDropdown
      trigger={
        <span className="inline-flex items-center gap-1">
          <RiFocus2Line />
          Follow AI
        </span>
      }
      triggerClassName={`nodrag relative inline-flex h-full cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-2 text-xs font-semibold transition-colors focus-visible:ring-2 active:!bg-blue-100 dark:hover:bg-setta-800 active:dark:!bg-blue-950 ${stateClasses}`}
      contentClassName="z-20 min-w-[220px] rounded-md border border-solid border-setta-100 bg-white p-1 shadow-xl transition-all will-change-[transform,opacity] dark:border-setta-700/50 dark:bg-setta-850"
    >
      <MenuItem
        className={menuItemClasses}
        onClick={() => {
          useAIFollow.setState((state) => {
            state.mode = "off";
          });
        }}
      >
        <RiCheckLine
          className={`h-3 w-3 ${mode === "off" ? "opacity-100" : "opacity-0"}`}
        />
        Off
      </MenuItem>
      <MenuItem
        className={menuItemClasses}
        onClick={() => {
          useAIFollow.setState((state) => {
            state.mode = "all";
          });
        }}
      >
        <RiCheckLine
          className={`h-3 w-3 ${mode === "all" ? "opacity-100" : "opacity-0"}`}
        />
        Follow all
      </MenuItem>
      <MenuItem
        className={menuItemClasses}
        shortcut={selectedCount ? String(selectedCount) : ""}
        onClick={() => {
          useAIFollow.setState((state) => {
            state.mode = "selected";
          });
        }}
      >
        <RiCheckLine
          className={`h-3 w-3 ${
            mode === "selected" ? "opacity-100" : "opacity-0"
          }`}
        />
        Follow selected
      </MenuItem>
      <div className="my-1 h-px bg-setta-100 dark:bg-setta-700/70" />
      {followEntries.length === 0 ? (
        <MenuItem className={menuItemClasses} disabled>
          No chats yet
        </MenuItem>
      ) : (
        followEntries.map((entry) => {
          const isSelected =
            entry.kind === "chat"
              ? selectedChatSet.has(entry.id)
              : selectedSectionSet.has(entry.id);
          return (
            <MenuItem
              key={entry.key}
              className={menuItemClasses}
              onClick={() => {
                useAIFollow.setState((state) => {
                  let selected: Array<string>;
                  if (entry.kind === "chat") {
                    selected =
                      state.selectedChatIdsByProjectConfigId[projectConfigId] ??
                      (state.selectedChatIdsByProjectConfigId[projectConfigId] =
                        []);
                  } else {
                    selected =
                      state.selectedSectionIdsByProjectConfigId[
                        projectConfigId
                      ] ??
                      (state.selectedSectionIdsByProjectConfigId[
                        projectConfigId
                      ] = []);
                  }
                  const existingIndex = selected.indexOf(entry.id);
                  if (existingIndex === -1) {
                    selected.push(entry.id);
                  } else {
                    selected.splice(existingIndex, 1);
                  }
                  if (state.mode !== "selected") {
                    state.mode = "selected";
                  }
                });
              }}
            >
              <RiCheckLine
                className={`h-3 w-3 ${
                  isSelected ? "opacity-100" : "opacity-0"
                }`}
              />
              {entry.label}
            </MenuItem>
          );
        })
      )}
      {selectedCount > 0 ? (
        <>
          <div className="my-1 h-px bg-setta-100 dark:bg-setta-700/70" />
          <MenuItem
            className={menuItemClasses}
            onClick={() => {
              useAIFollow.setState((state) => {
                state.selectedChatIdsByProjectConfigId[projectConfigId] = [];
                state.selectedSectionIdsByProjectConfigId[projectConfigId] = [];
              });
            }}
          >
            Clear selection
          </MenuItem>
        </>
      ) : null}
    </NavbarMenuDropdown>
  );
}
