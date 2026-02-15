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
import { useRef } from "react";
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
  const itemsWithoutId = useCreateSectionsList();
  const allItems: AllItemsType<string> = [];
  // adds id to each item
  // TODO: make this less bad
  for (const g of itemsWithoutId) {
    allItems.push({
      group: g.group,
      items: g.items.map((i) => ({ id: i.name, name: i.name })),
    });
  }

  const onSelectedItemChange: OnSelectedItemChangeFnType<string> = (id) => {
    // finds matching item, and then uses its specificProps
    // TODO: make this less bad
    let match: CreateSectionsContextMenuInfo | null = null;
    for (const g of itemsWithoutId) {
      for (const item of g.items) {
        if (item.name === id) {
          match = item;
          break;
        }
      }
    }

    if (!match) {
      return;
    }

    createTopLevelSectionFromImplSpecs(match);
  };

  return (
    <ProjectPageAdvancedCore
      allItems={allItems}
      onSelectedItemChange={onSelectedItemChange}
    />
  );
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
