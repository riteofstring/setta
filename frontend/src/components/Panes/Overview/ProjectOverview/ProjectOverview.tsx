import { StandardSearch } from "components/Utils/atoms/search/StandardSearch";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import _ from "lodash";
import React from "react";
import { getSectionImpl } from "state/actions/sectionInfos";
import { useProjectState, ZustandProjectState } from "state/definitions";
import { useMatchSorterFilter } from "state/hooks/utils";
import {
  SectionCore,
  SectionImplUnion,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { ProjectName } from "./ProjectName";
import { SectionListItems } from "./SectionListItems";

export const ProjectOverview = React.forwardRef(() => {
  const sectionList = useOverviewListing();
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
        {...getFloatingBoxHandlers({
          content: "Search through your project's cards.",
        })}
      />

      <div className="min-h-0 flex-grow overflow-y-scroll">
        <ul
          className="min-h-0 flex-grow"
          {...getFloatingBoxHandlers({
            content: "Click on a section name to pan to it.",
          })}
        >
          <SectionListItems listOfSectionIdsAndNames={filteredList} />
        </ul>
      </div>
    </>
  );
}

export function useOverviewListing() {
  return useProjectState((x) => {
    const outputList = [];
    for (const section of Object.values(x.sections)) {
      if (!section.parentId) {
        getDepthListingHelper(section.id, 0, x, outputList);
      }
    }
    return outputList;
  }, _.isEqual);
}

function getDepthListingHelper(
  section: SectionCore,
  sectionImpl: SectionImplUnion,
  depth: number,
  x: ZustandProjectState,
  outputList: Array<OverviewListingType>,
) {
  if (sectionImpl.visibility[x.projectConfig.viewingEditingMode])
    outputList.push({
      id: section.id,
      name: section.name,
      depth: depth,
    });

  if (sectionImpl.type === SectionTypeEnum.ListRoot) {
    const children = sectionImpl.children;
    if (children) {
      for (const childId of children) {
        getDepthListingHelper(childId, depth + 1, x, outputList);
      }
    }
  }
}
