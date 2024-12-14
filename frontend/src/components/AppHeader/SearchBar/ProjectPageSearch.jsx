import { useOverviewListing } from "components/Panes/Overview/ProjectOverview";
import { StandardSearch } from "components/Utils/atoms/search/StandardSearch";
import {
  ComboboxItems,
  ComboboxList,
} from "components/Utils/Combobox/ComboboxParts";
import { useIdNameCombobox } from "components/Utils/Combobox/useIdNameCombobox";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import React, { useRef } from "react";
import { goToSection } from "state/actions/sections/sectionPositions";
import { useProjectSearch } from "state/definitions";
import { useUpdateProjectSearch } from "state/hooks/search";
import { focusOnSection } from "utils/tabbingLogic";

export function ProjectPageSearchBar() {
  return (
    <ProjectPageSearchBarWrapper>
      <ProjectPageSearchInput />
    </ProjectPageSearchBarWrapper>
  );
}

function ProjectPageSearchBarWrapper({ children }) {
  const mode = useProjectSearch((x) => x.mode);

  if (mode === "find") {
    return <ProjectPageFind>{children}</ProjectPageFind>;
  }
  return <ProjectPageAdvanced>{children}</ProjectPageAdvanced>;
}

const ProjectPageSearchInput = React.forwardRef((props, ref) => {
  return (
    <StandardSearch
      outerClasses="self-center w-[clamp(10rem,_30vw,_15rem)]  ml-4"
      inputStyles="flex-grow outline-0 cursor-auto overflow-hidden bg-setta-100 dark:bg-setta-950 hover:bg-white  hover:ring-setta-200 dark:hover:ring-setta-600 focus:bg-white rounded-full text-xs text-setta-900 dark:text-setta-200 ring-2 ring-transparent focus-visible:ring-blue-300 pl-7 py-1 placeholder-setta-300 dark:placeholder-setta-700"
      leftElementStyles="pl-1"
      placeholder="Search Project"
      {...props}
      ref={ref}
      {...getFloatingBoxHandlers(
        "Search your entire project from one location.",
      )}
      id="ProjectPageSearchBar"
    />
  );
});

function ProjectPageFind({ children }) {
  const { value, onChange, onBlur, onFocus, onKeyDown } =
    useUpdateProjectSearch();

  return React.cloneElement(children, {
    value,
    onChange,
    onBlur,
    onFocus,
    onKeyDown,
  });
}

function ProjectPageAdvanced({ children }) {
  const allSections = useOverviewListing();
  const allItems = [{ group: "Sections", items: allSections }];

  return (
    <ProjectPageAdvancedCore allItems={allItems}>
      {children}
    </ProjectPageAdvancedCore>
  );
}

function ProjectPageAdvancedCore({ allItems, children }) {
  function onSelectedItemChange(id) {
    goToSection(id);
    focusOnSection(null, id, false);
  }

  const {
    isOpen,
    filteredItems,
    // getToggleButtonProps,
    getMenuProps,
    getInputProps,
    highlightedIndex,
    getItemProps,
    itemToString,
    onInputClick,
    listDims,
  } = useIdNameCombobox({
    allItems,
    onSelectedItemChange,
  });

  const inputRef = useRef();

  return (
    <>
      {React.cloneElement(children, {
        ...getInputProps({
          onClick: () => onInputClick(inputRef.current),
          ref: inputRef,
        }),
      })}

      <ComboboxList
        isOpen={isOpen}
        getMenuProps={getMenuProps}
        listDims={listDims}
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
