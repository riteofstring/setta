import { matchSorter } from "match-sorter";
import { useSectionInfos } from "./info/sectionInfos";
import { createProjectState } from "./utils";

const initialState = { sections: [] };

export const useProjectSearch = createProjectState((set) => ({
  ...initialState,
}));

export function updateSearch(value) {
  if (!value) {
    useProjectSearch.setState({ sections: [] });
    return;
  }
  
  const sections = matchSorter(
    Object.values(useSectionInfos.getState().x),
    value,
    {
      keys: ["name"],
    }
  );
  useProjectSearch.setState({ sections: sections.map((x) => x.id) });
}
