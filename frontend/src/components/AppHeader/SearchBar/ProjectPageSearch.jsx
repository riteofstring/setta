import { StandardSearch } from "components/Utils/atoms/search/StandardSearch";
import { IdNameCombobox } from "components/Utils/Combobox/IdNameCombobox";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import { useEffect, useRef} from "react";
import {
  clickOnProjectPageAdvancedSearch,
  clickOnProjectPageFind,
} from "state/actions/sections/sectionParamFilter";
import { goToSection } from "state/actions/sections/sectionPositions";
import { useProjectSearch, useSectionInfos } from "state/definitions";
import { useUpdateProjectSearch } from "state/hooks/search";
import { focusOnSection } from "utils/tabbingLogic";
import { SimpleSearchBar } from "./HomePageSearch";

export function ProjectPageSearchBar() {
  const mode = useProjectSearch((x) => x.mode);

  useEffect(() => {
    if (mode === "simple") {
      clickOnProjectPageFind();
    } else {
      clickOnProjectPageAdvancedSearch();
    }
  }, [mode]);

  switch (mode) {
    case "simple":
      return <ProjectPageFind />;
    case "advanced":
      return <ProjectPageAdvancedSearch />;
  }
}

function ProjectPageFind() {
  const { value, onChange, onBlur, onFocus, onKeyDown } =
    useUpdateProjectSearch();

  return (
    <SimpleSearchBar
      divId="ProjectPageFind"
      placeholder="Search Project"
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      onFocus={onFocus}
      {...getFloatingBoxHandlers(
        "Search your entire project from one location.",
      )}
    />
  );
}

function ProjectPageAdvancedSearch() {
  const allSections = useSectionInfos((x) =>
    Object.values(x.x).map((s) => ({ id: s.id, name: s.name })),
  );
  const allItems = [{ group: "Sections", items: allSections }];

  function onSelectedItemChange(id) {
    goToSection(id);
    focusOnSection(null, id, false);
  }

  return (
    <IdNameCombobox
      allItems={allItems}
      onSelectedItemChange={onSelectedItemChange}
      inputDivId="ProjectPageFind"
      InputComponent={ProjectSearchBar}
    />
  );
}

function ProjectSearchBar({
  divId,
  getInputProps,
  getToggleButtonProps,
  isOpen,
  small,
  onInputClick,
  placeholder,
  bg = "bg-white dark:bg-setta-900",
  isDisabled,
}) {
  const inputRef = useRef();

  return (
    <StandardSearch
      id={divId}
      outerClasses="self-center w-[clamp(10rem,_30vw,_15rem)]  ml-4"
      inputStyles="flex-grow outline-0 cursor-auto overflow-hidden bg-setta-100 dark:bg-setta-950 hover:bg-white  hover:ring-setta-200 dark:hover:ring-setta-600 focus:bg-white rounded-full text-xs text-setta-900 dark:text-setta-200 ring-2 ring-transparent focus-visible:ring-blue-300 pl-7 py-1 placeholder-setta-300 dark:placeholder-setta-700"
      leftElementStyles="pl-1"
      placeholder={placeholder}
      {...getInputProps({
        id: divId,
        onClick: () => onInputClick(inputRef.current),
        ref: inputRef,
        disabled: isDisabled,
      })}
    />
  );
}
