import { useOverviewListing } from "components/Panes/Overview/ProjectOverview/ProjectOverview";
import {
  ComboboxItems,
  ComboboxList,
} from "components/Utils/Combobox/ComboboxParts";
import {
  AllItemsType,
  OnSelectedItemChangeFnType,
} from "components/Utils/Combobox/ComboboxStateReducer";
import { useIdNameCombobox } from "components/Utils/Combobox/useIdNameCombobox";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import _ from "lodash";
import {
  usePluginCommands,
  type RegisteredPluginCommand,
} from "plugins/runtime";
import { useMemo, useRef } from "react";
import { addTemporaryNotification } from "state/actions/notifications";
import {
  CreateSectionsContextMenuInfo,
  createTopLevelSectionFromImplSpecs,
  useCreateSectionsList,
} from "state/actions/sections/createSectionsHelper";
import { ProjectPageSearchBarDivId } from "state/actions/sections/sectionParamFilter";
import { goToSection } from "state/actions/sections/sectionPositions";
import { useProjectSearch, useSettings } from "state/definitions";
import { useUpdateProjectSearch } from "state/hooks/search";
import { ProjectSearchModeEnum } from "utils/constants";
import { shortcutPrettified } from "utils/utils";

export function ProjectPageSearchBar() {
  const mode = useProjectSearch((x) => x.mode);

  switch (mode) {
    case ProjectSearchModeEnum.find:
      return <ProjectPageFind />;
    case ProjectSearchModeEnum.advanced:
      return <ProjectPageAdvanced />;
    case ProjectSearchModeEnum.commandPalette:
      return <ProjectPageCommandPalette />;
    default:
      return mode satisfies never;
  }
}

function ProjectPageSearchInput({
  rightElement,
  ...props
}: {
  rightElement?: React.ReactNode;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const shortcuts = useSettings((x) => {
    return {
      searchkey: shortcutPrettified(x.shortcuts.searchShortcut),
      advancedkey: shortcutPrettified(x.shortcuts.advancedSearchShortcut),
      commandkey: shortcutPrettified(x.shortcuts.commandPaletteShortcut),
    };
  }, _.isEqual);

  return (
    <search className="nodrag relative mx-[2px] ml-4 flex w-[clamp(1rem,_30vw,_30rem)] min-w-0 items-center self-center dark:text-setta-200">
      <div className="pointer-events-none absolute left-0 grid select-none place-items-center pl-1">
        <i
          className="gg-sort-az ml-[.4rem] !scale-75 text-setta-300 dark:text-setta-600"
          aria-hidden="true"
        />
      </div>
      <input
        id={ProjectPageSearchBarDivId}
        className="w-full flex-grow cursor-auto overflow-hidden rounded-full bg-setta-100 py-1 pl-7 pr-2 text-xs text-setta-900 placeholder-setta-300 outline-offset-2 outline-blue-500 hover:bg-setta-50 focus:bg-white focus-visible:outline dark:bg-setta-950 dark:text-setta-200 dark:placeholder-setta-600 dark:hover:bg-setta-800/50"
        placeholder={`Args (${shortcuts.searchkey}) / Search (${shortcuts.advancedkey}) / Create (${shortcuts.commandkey})`}
        tabIndex={0}
        autoComplete="off"
        {...getFloatingBoxHandlers({
          content: "Search your entire project from one location.",
        })}
        {...props}
      />
      {rightElement}
    </search>
  );
}

function ProjectPageFind() {
  const { value, onChange, onBlur, onFocus, onKeyDown, currIdx, numResults } =
    useUpdateProjectSearch();

  return (
    <ProjectPageSearchInput
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      rightElement={
        value ? (
          <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-setta-400 dark:text-setta-500">
            {currIdx >= 0 ? `${currIdx + 1} of ${numResults}` : numResults}
          </div>
        ) : null
      }
    />
  );
}

function ProjectPageAdvanced() {
  const allSections = useOverviewListing();
  const allItems = [{ group: "Sections", items: allSections }];
  function onSelectedItemChange(id: string | null) {
    if (id) {
      goToSection(id);
    }
    // focusOnSection(null, id, false);
  }

  return (
    <ProjectPageAdvancedCore
      allItems={allItems}
      onSelectedItemChange={onSelectedItemChange}
    />
  );
}

function ProjectPageCommandPalette() {
  const createSectionGroups = useCreateSectionsList();
  const pluginCommands = usePluginCommands();
  const commandPaletteModel = useMemo(
    () =>
      buildProjectCommandPaletteEntries({
        createSectionGroups,
        pluginCommands,
      }),
    [createSectionGroups, pluginCommands],
  );

  const onSelectedItemChange: OnSelectedItemChangeFnType<string> = (id) => {
    if (!id) {
      return;
    }
    const action = commandPaletteModel.actionById[id];
    if (!action) {
      return;
    }
    void Promise.resolve(action()).catch((error: unknown) => {
      const message =
        error instanceof Error ? error.message : `Command failed: ${id}`;
      addTemporaryNotification(message, "error");
    });
  };

  return (
    <ProjectPageAdvancedCore
      allItems={commandPaletteModel.allItems}
      onSelectedItemChange={onSelectedItemChange}
    />
  );
}

type ProjectCommandPaletteModel = {
  allItems: AllItemsType<string>;
  actionById: Record<string, () => void | Promise<void>>;
};

function buildProjectCommandPaletteEntries({
  createSectionGroups,
  pluginCommands,
}: {
  createSectionGroups: Array<{
    group: string;
    items: Array<CreateSectionsContextMenuInfo>;
  }>;
  pluginCommands: RegisteredPluginCommand[];
}): ProjectCommandPaletteModel {
  const allItems: AllItemsType<string> = [];
  const actionById: Record<string, () => void | Promise<void>> = {};

  for (const createSectionGroup of createSectionGroups) {
    const itemsWithIds: Array<{ id: string; name: string }> = [];
    for (const item of createSectionGroup.items) {
      const id = `create:${createSectionGroup.group}:${item.name}`;
      itemsWithIds.push({ id, name: item.name });
      actionById[id] = () => {
        createTopLevelSectionFromImplSpecs(item);
      };
    }
    allItems.push({
      group: createSectionGroup.group,
      items: itemsWithIds,
    });
  }

  if (pluginCommands.length > 0) {
    const pluginCommandItems = pluginCommands.map((command) => {
      const id = `plugin-command:${command.pluginId}:${command.id}`;
      actionById[id] = command.run;
      return {
        id,
        name: `${command.title} (${command.pluginId})`,
      };
    });
    allItems.push({
      group: "Plugin Commands",
      items: pluginCommandItems,
    });
  }

  return {
    allItems,
    actionById,
  };
}

function ProjectPageAdvancedCore<T>({
  allItems,
  onSelectedItemChange,
}: {
  allItems: AllItemsType<T>;
  onSelectedItemChange: OnSelectedItemChangeFnType<T>;
}) {
  const {
    isOpen,
    filteredItems,
    getMenuProps,
    getInputProps,
    highlightedIndex,
    getItemProps,
    itemToString,
    onKeyDown,
  } = useIdNameCombobox({
    allItems,
    onSelectedItemChange,
    clearInputAfterSelection: true,
  });

  const inputRef = useRef<HTMLInputElement>(null);
  const inputProps = getInputProps({
    id: ProjectPageSearchBarDivId,
    onKeyDown,
    ref: inputRef,
  });

  return (
    <>
      <ProjectPageSearchInput {...inputProps} />
      <ComboboxList
        isOpen={isOpen}
        getMenuProps={getMenuProps}
        inputRef={inputRef}
      >
        <ComboboxItems
          filteredItems={filteredItems}
          getItemProps={getItemProps}
          highlightedIndex={highlightedIndex}
          itemToString={itemToString}
        />
      </ComboboxList>
    </>
  );
}

export const projectPageSearchTestApi = {
  buildProjectCommandPaletteEntries,
};
