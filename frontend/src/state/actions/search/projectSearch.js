import { matchSorter } from "match-sorter";
import { useProjectSearch } from "state/definitions";

export function updateSearch(value, allVisibleParams) {
  if (!value) {
    useProjectSearch.setState({ sections: [], codeInfo: [] });
    return;
  }

  // const sections = matchSorter(
  //   Object.values(useSectionInfos.getState().x),
  //   value,
  //   {
  //     keys: ["name"],
  //   },
  // );

  const codeInfo = matchSorter(allVisibleParams, value, {
    keys: ["name"],
  });

  useProjectSearch.setState({
    // sections: sections.map((x) => x.id),
    codeInfo: codeInfo.map((x) => ({
      sectionId: x.sectionId,
      paramInfoId: x.paramInfoId,
    })),
  });
}
