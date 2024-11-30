import { StandardSearch } from "components/Utils/atoms/search/StandardSearch";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import _ from "lodash";
import React from "react";
import { useNodeInternals } from "state/definitions";
import { useSectionInfoNames } from "state/hooks/sections";
import { useSectionIdToChildren } from "state/hooks/sectionVariants";
import { useMatchSorterFilter } from "state/hooks/utils";
import { getDepthListing } from "utils/childrenToDepth";
import { ProjectName } from "./ProjectName";
import { SectionListItems } from "./SectionListItems";

export const ProjectOverview = React.forwardRef(() => {
  const sectionList = useGetOverviewListing();
  return <ProjectOverviewCore sectionList={sectionList} />;
});

function ProjectOverviewCore({ sectionList }) {
  const [filteredList, setFilter] = useMatchSorterFilter(sectionList, ["name"]);

  return (
    <>
      <ProjectName />
      <StandardSearch
        inputStyles="flex-grow outline-0 min-w-0 cursor-auto bg-transparent [border-width:0_0_1px_0] border-solid border-setta-200 dark:border-setta-800  focus-visible:!border-blue-300 pl-5 py-1 truncate placeholder-setta-400 dark:placeholder-setta-700 text-sm"
        outerClasses="pb-4"
        leftElementStyles="pl-1"
        placeholder="Filter"
        leftElement={
          <i className="gg-sort-az !scale-75 text-setta-600 dark:text-setta-400" />
        }
        onChange={(e) => setFilter(e.target.value)}
        {...getFloatingBoxHandlers("Search through your project's cards.")}
      />

      <div className="min-h-0 flex-grow overflow-y-scroll">
        <ul
          className="min-h-0 flex-grow"
          {...getFloatingBoxHandlers("Click on a section name to pan to it.")}
        >
          <SectionListItems listOfSectionIdsAndNames={filteredList} />
        </ul>
      </div>
    </>
  );
}

function useGetOverviewListing() {
  const topLevelSectionIds = useNodeInternals(
    (x) => [...x.x.keys()],
    _.isEqual,
  );
  const sectionChildren = useSectionIdToChildren();
  const idNames = useSectionInfoNames();

  return getDepthListing(topLevelSectionIds, sectionChildren, idNames);
}
