import { SearchIcon } from "@chakra-ui/icons";
import { Input, InputGroup, InputLeftElement } from "@chakra-ui/react";
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

import SectionList from "./SectionList/SectionList";

const paneProps = {
  right: false,
  paneName: OVERVIEW,
};

export default function Overview() {
  const [sectionList, setSectionList] = useState([[]]);
  const [filteredList, setFilter] = useMatchSorterFilter(sectionList[0], [
    "sectionHeading",
  ]);

  const topLevelSectionIds = useProjectConfig((x) => x.children);
  const currChildren = useSectionInfos((x) => x.currChildren);
  const idNames = useSectionInfoNames();

  useDeepCompareEffect(() => {
    setSectionList(
      getOverviewListing([topLevelSectionIds], currChildren, idNames)
    );
  }, [topLevelSectionIds, currChildren, idNames]);

  const onResizeStop = useUpdateMapPosition();

  return (
    <PaneContainer
      paneProps={paneProps}
      paneTitle="Overview"
      onResizeStop={onResizeStop}
    >
      <InputGroup pb="1rem">
        <InputLeftElement pointerEvents="none">
          <SearchIcon color="gray.300" />
        </InputLeftElement>
        <Input
          variant="flushed"
          placeholder="Search"
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Overview Search"
        />
      </InputGroup>

      <SectionList listOfSectionIdsAndNames={[filteredList]} />
    </PaneContainer>
  );
}
