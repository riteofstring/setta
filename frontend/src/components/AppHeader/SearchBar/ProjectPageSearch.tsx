import { useOverviewListing } from "components/Panes/Overview/ProjectOverview/ProjectOverview";
import {
  ComboboxItems,
  ComboboxList,
} from "components/Utils/Combobox/ComboboxParts";
import { useIdNameCombobox } from "components/Utils/Combobox/useIdNameCombobox";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import _ from "lodash";
import { useRef } from "react";
import { addCallableSectionInEmptySpace } from "state/actions/sections/createSections";
import { useCreateSectionsList } from "state/actions/sections/createSectionsHelper";
import { ProjectPageSearchBarDivId } from "state/actions/sections/sectionParamFilter";
import { goToSection } from "state/actions/sections/sectionPositions";
import {
  useProjectSearch,
  useProjectState,
  useSettings,
} from "state/definitions";
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

function ProjectPageSearchInput({ ref, rightElement, ...props }) {
  const shortcuts = useSettings((x) => {
    return {
      advancedkey: shortcutPrettified(x.shortcuts.advancedSearchShortcut),
      commandkey: shortcutPrettified(x.shortcuts.commandPaletteShortcut),
    };
  }, _.isEqual);

  return (
    <search className="nodrag relative mx-[2px] ml-4 flex w-[clamp(1rem,_30vw,_30rem)] min-w-0 items-center self-center dark:text-setta-200">
      <input
        id={ProjectPageSearchBarDivId}
        className="w-full flex-grow cursor-auto overflow-hidden rounded-full bg-setta-100 py-1 pl-7 pr-2 text-xs text-setta-900 placeholder-setta-300 outline-offset-2 outline-blue-500 hover:bg-setta-50 focus:bg-white focus-visible:outline dark:bg-setta-950 dark:text-setta-200 dark:placeholder-setta-600 dark:hover:bg-setta-800/50"
        placeholder={`Search (${shortcuts.advancedkey}) / Create (${shortcuts.commandkey})`}
        tabIndex={0}
        {...getFloatingBoxHandlers({
          content: "Search your entire project from one location.",
        })}
        {...props}
        ref={ref}
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
  function onSelectedItemChange(id: string) {
    goToSection(id);
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
  const allItems = useCreateSectionsList();
  // adds id to each item
  // TODO: make this less bad
  for (const g of allItems) {
    for (const item of g.items) {
      item.id = item.name;
    }
  }

  function onSelectedItemChange(id) {
    // finds matching item, and then uses its specificProps
    // TODO: make this less bad
    let match = null;
    for (const g of allItems) {
      for (const item of g.items) {
        if (item.id === id) {
          match = item;
          break;
        }
      }
    }

    if (!match) {
      return;
    }

    // get corresponding item and its section props
    useProjectState.setState((state) => {
      addCallableSectionInEmptySpace({
        state,
        ...match.specificProps,
      });
    });
  }

  return (
    <ProjectPageAdvancedCore
      allItems={allItems}
      onSelectedItemChange={onSelectedItemChange}
    />
  );
}

function ProjectPageAdvancedCore({ allItems, onSelectedItemChange }) {
  const {
    isOpen,
    filteredItems,
    // getToggleButtonProps,
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

  const inputRef = useRef(null);
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
