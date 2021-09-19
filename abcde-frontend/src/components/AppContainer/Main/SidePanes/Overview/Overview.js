import { useState, useEffect } from "react";
import PaneContainer from "../PaneContainer";
import { Heading } from "@chakra-ui/react";
import SectionList from "./SectionList/SectionList";
import { useStoreState } from "easy-peasy";
import { getOverviewListing } from "../../../../../utils/sectionIds";
import { useAtomValue } from "jotai/utils";
import { allChildren } from "../../../../UI/Section/state";

const paneProps = {
  right: false,
  paneName: "overview",
};

export default function Overview() {
  const [listOfSectionIdsAndNames, setListOfSectionIdsAndNames] = useState([]);

  const pageMinMaxList = useStoreState((state) => state.master.pageMinMaxList);
  const childrenOverview = useAtomValue(allChildren);
  const idNames = useStoreState((state) => state.master.idNames);

  useEffect(() => {
    console.log("**************Overview useEffect");
    console.log("childrenOverview", childrenOverview);
    setListOfSectionIdsAndNames(
      getOverviewListing(pageMinMaxList, childrenOverview, idNames)
    );
  }, [childrenOverview, pageMinMaxList, idNames]);

  return (
    <PaneContainer paneProps={paneProps}>
      <Heading as="h2" size="md" color="gray.500" pb=".5rem">
        Overview
      </Heading>
      <SectionList listOfSectionIdsAndNames={listOfSectionIdsAndNames} />
    </PaneContainer>
  );
}
