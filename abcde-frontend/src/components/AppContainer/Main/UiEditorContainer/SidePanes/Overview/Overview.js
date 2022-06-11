import { SearchIcon } from "@chakra-ui/icons";
import { Heading, Input, InputGroup, InputLeftElement } from "@chakra-ui/react";
import PaneContainer from "components/AppContainer/Main/PaneContainer/PaneContainer";
import { useStoreState } from "easy-peasy";
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

  const topLevelSectionPositions = useStoreState(
    (x) => x.sectionInfos.topLevelSectionPositions
  );
  const currChildren = useStoreState((x) => x.sectionInfos.currChildren);
  const idNames = useStoreState((x) => x.sectionInfos.idNames);

  useDeepCompareEffect(() => {
    console.log("Overview useEffect");
    setListOfSectionIdsAndNames(
      getOverviewListing(
        [_.map(topLevelSectionPositions, (x) => x.id)],
        currChildren,
        idNames
      )
    );
  }, [currChildren, idNames]);

  return (
    <PaneContainer paneProps={paneProps}>
      <Heading
        as="h2"
        size="md"
        color="gray.300"
        pb=".75rem"
        textTransform="uppercase"
        letterSpacing="widest"
      >
        Overview
      </Heading>
      <InputGroup pb="1rem">
        <InputLeftElement
          pointerEvents="none"
          children={<SearchIcon color="gray.300" />}
        />
        <Input variant="flushed" placeholder="Search" />
      </InputGroup>

      <SectionList listOfSectionIdsAndNames={listOfSectionIdsAndNames} />
    </PaneContainer>
  );
}
