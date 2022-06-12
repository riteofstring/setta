import { SearchIcon } from "@chakra-ui/icons";
import { Input, InputGroup, InputLeftElement } from "@chakra-ui/react";
import PaneContainer from "components/AppContainer/Main/PaneContainer/PaneContainer";
import { useStoreState } from "easy-peasy";
import { matchSorter } from "match-sorter";
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
  const [listOfSectionIdsAndNames, setListOfSectionIdsAndNames] = useState([]);
  const [filter, setFilter] = useState("");
  const [filteredList, setFilteredList] = useState([]);

  const topLevelSectionIds = useStoreState((x) =>
    x.sectionInfos.topLevelSectionPositions.map((x) => x.id)
  );
  const currChildren = useStoreState((x) => x.sectionInfos.currChildren);
  const idNames = useStoreState((x) => x.sectionInfos.idNames);

  useDeepCompareEffect(() => {
    if (listOfSectionIdsAndNames.length > 0) {
      setFilteredList([
        matchSorter(listOfSectionIdsAndNames[0], filter, {
          keys: ["sectionHeading"],
        }),
      ]);
    }
  }, [filter, listOfSectionIdsAndNames]);

  useDeepCompareEffect(() => {
    console.log("Overview useEffect");
    setListOfSectionIdsAndNames(
      getOverviewListing([topLevelSectionIds], currChildren, idNames)
    );
  }, [topLevelSectionIds, currChildren, idNames]);

  return (
    <PaneContainer paneProps={paneProps} paneTitle="Overview">
      <InputGroup pb="1rem">
        <InputLeftElement pointerEvents="none">
          <SearchIcon color="gray.300" />
        </InputLeftElement>
        <Input
          variant="flushed"
          placeholder="Search"
          onChange={(e) => setFilter(e.target.value)}
          value={filter}
        />
      </InputGroup>

      <SectionList listOfSectionIdsAndNames={filteredList} />
    </PaneContainer>
  );
}
