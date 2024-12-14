import { StandardSearch } from "components/Utils/atoms/search/StandardSearch";
import {
  ComboboxItems,
  ComboboxList,
} from "components/Utils/Combobox/ComboboxParts";
import { useIdNameCombobox } from "components/Utils/Combobox/useIdNameCombobox";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import React from "react";
import { goToSection } from "state/actions/sections/sectionPositions";
import { useProjectSearch, useSectionInfos } from "state/definitions";
import { useUpdateProjectSearch } from "state/hooks/search";
import { useOtherRefAndInit } from "state/hooks/sectionRef";
import { focusOnSection } from "utils/tabbingLogic";

export function ProjectPageSearchBar() {
  const inputId = "ProjectPageSearchBar";
  const ref = useOtherRefAndInit(inputId);

  return (
    <ProjectPageSearchBarWrapper ref={ref} inputId={inputId}>
      <ProjectPageSearchInput />
    </ProjectPageSearchBarWrapper>
  );
}

const ProjectPageSearchBarWrapper = React.forwardRef(
  ({ children, inputId }, ref) => {
    const mode = useProjectSearch((x) => x.mode);

    if (mode === "find") {
      return (
        <ProjectPageFind ref={ref} inputId={inputId}>
          {children}
        </ProjectPageFind>
      );
    }
    return (
      <ProjectPageAdvanced ref={ref} inputId={inputId}>
        {children}
      </ProjectPageAdvanced>
    );
  },
);

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
    />
  );
});

const ProjectPageFind = React.forwardRef(({ children, inputId }, ref) => {
  const { value, onChange, onBlur, onFocus, onKeyDown } =
    useUpdateProjectSearch();

  return React.cloneElement(children, {
    id: inputId,
    value,
    onChange,
    onBlur,
    onFocus,
    onKeyDown,
    ref,
  });
});

const ProjectPageAdvanced = React.forwardRef(({ children, inputId }, ref) => {
  const allSections = useSectionInfos((x) =>
    Object.values(x.x).map((s) => ({ id: s.id, name: s.name })),
  );
  const allItems = [{ group: "Sections", items: allSections }];

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

  return (
    <>
      {React.cloneElement(children, {
        ...getInputProps({
          id: inputId,
          onClick: () => onInputClick(inputRef.current),
          ref,
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
});
