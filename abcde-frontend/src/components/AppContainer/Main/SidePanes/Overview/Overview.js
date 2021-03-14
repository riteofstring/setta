import PaneContainer from "../PaneContainer";
import { Heading } from "@chakra-ui/react";
import SectionList from "./SectionList/SectionList";
import { useStoreState } from "easy-peasy";
import { getOverviewListing } from "../../../../../utils/sectionIds";

const paneProps = {
  right: false,
  paneName: "overview",
};

export default function Overview() {
  const rootIdHierarchy = useStoreState(
    (state) => state.master.rootIdHierarchy
  );
  const idHierarchy = useStoreState((state) => state.master.idHierarchy);
  const isVisible = useStoreState((state) => state.master.isVisible);
  const isList = useStoreState((state) => state.master.isList);
  const isListRoot = useStoreState((state) => state.master.isListRoot);
  const sectionIdsToSectionHeadings = useStoreState(
    (state) => state.master.sectionIdsToSectionHeadings
  );
  const sectionSizes = useStoreState(
    (state) => state.sectionSizes.sectionSizes
  );
  const getListOfSectionIdsAndNames = () => {
    const overviewListing = getOverviewListing(
      rootIdHierarchy,
      idHierarchy,
      isVisible,
      sectionIdsToSectionHeadings,
      isList,
      isListRoot,
      sectionSizes
    );
    console.log("overviewListing", overviewListing);
    return overviewListing;
  };

  return (
    <PaneContainer paneProps={paneProps}>
      <Heading as="h2" size="md" color="gray.500" pb=".5rem">
        Overview
      </Heading>
      <SectionList listOfSectionIdsAndNames={getListOfSectionIdsAndNames()} />
    </PaneContainer>
  );
}
