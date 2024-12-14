import { IdNameCombobox } from "components/Utils/Combobox/IdNameCombobox";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import { useEffect } from "react";
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
      inputDivId="ProjectPageAdvancedSearch"
      onSelectedItemChange={onSelectedItemChange}
    />
  );
}
