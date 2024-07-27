import { matchSorter } from "match-sorter";
import { useCodeInfo } from "./info/codeInfo";
import { useSectionInfos } from "./info/sectionInfos";
import { createProjectState } from "./utils";

const initialState = { sections: [], codeInfo: [] };

export const useProjectSearch = createProjectState((set) => ({
  ...initialState,
}));

export function updateSearch(value) {
  if (!value) {
    useProjectSearch.setState({ sections: [], codeInfo: [] });
    return;
  }

  const sections = matchSorter(
    Object.values(useSectionInfos.getState().x),
    value,
    {
      keys: ["name"],
    },
  );

  const codeInfo = matchSorter(Object.values(useCodeInfo.getState().x), value, {
    keys: ["name"],
  });

  useProjectSearch.setState({
    sections: sections.map((x) => x.id),
    codeInfo: codeInfo.map((x) => x.id),
  });
}
