import PaneContainer from "components/AppContainer/Main/PaneContainer/PaneContainer";
import { useMatchSorterFilter } from "hooks/useMatchSorterFilter";
import { useSectionInfoNames } from "hooks/useSectionInfo";
import { useUpdateMapPosition } from "hooks/useUpdateMapPosition";
import { useProjectConfig } from "models/info/projectConfig";
import { useSectionInfos } from "models/info/sectionInfos";
import { useState } from "react";
import useDeepCompareEffect from "use-deep-compare-effect";
import { OVERVIEW } from "utils/constants";
import { getOverviewListing } from "utils/sectionIds";
import SectionListItems from "./SectionList/SectionListItems";

const paneProps = {
  right: false,
  paneName: OVERVIEW,
};

export default function Overview() {
  const [sectionList, setSectionList] = useState([]);
  const [filteredList, setFilter] = useMatchSorterFilter(sectionList, [
    "sectionHeading",
  ]);

  const topLevelSectionIds = useProjectConfig((x) => x.children);
  const currChildren = useSectionInfos((x) => x.currChildren);
  const idNames = useSectionInfoNames();

  useDeepCompareEffect(() => {
    setSectionList(
      getOverviewListing(topLevelSectionIds, currChildren, idNames)
    );
  }, [topLevelSectionIds, currChildren, idNames]);

  const onResizeStop = useUpdateMapPosition();

  return (
    <PaneContainer
      paneProps={paneProps}
      paneTitle="Overview"
      onResizeStop={onResizeStop}
    >
      <div className="pb-4">
        <input
          placeholder="Search"
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Overview Search"
        />
      </div>
      <SectionListItems listOfSectionIdsAndNames={filteredList} />
    </PaneContainer>
  );
}
