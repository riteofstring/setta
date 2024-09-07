import { StandardSearch } from "components/Utils/atoms/search/StandardSearch";
import React from "react";
import { BiFilter } from "react-icons/bi";
import { getInfoViewHandlers } from "state/actions/infoView";
import { useGetOverviewListing } from "state/hooks/overview";
import { CONST_INFO_VIEWS } from "utils/constants";
import { InfoView } from "./InfoView";
import { ProjectName } from "./ProjectName";
import { SectionListItems } from "./SectionListItems";

export const ProjectOverview = React.forwardRef(() => {
  const [filteredList, setFilter] = useGetOverviewListing();

  return (
    <>
      <ProjectName />
      <StandardSearch
        inputStyles="flex-grow outline-0 min-w-0 cursor-auto bg-transparent [border-width:0_0_1px_0] border-solid border-setta-200 dark:border-setta-800  focus-visible:!border-blue-300 pl-7 py-1 truncate"
        outerClasses="pb-4"
        leftElementStyles="pl-1"
        placeholder="Filter"
        leftElement={
          <BiFilter className="text-setta-600 dark:text-setta-400" />
        }
        onChange={(e) => setFilter(e.target.value)}
        {...getInfoViewHandlers(CONST_INFO_VIEWS.OVERVIEW_SEARCH)}
      />

      <div className="min-h-0 flex-grow overflow-y-scroll">
        <ul
          className="min-h-0 flex-grow"
          {...getInfoViewHandlers(CONST_INFO_VIEWS.OVERVIEW)}
        >
          <SectionListItems listOfSectionIdsAndNames={filteredList} />
        </ul>
      </div>
      <InfoView />
    </>
  );
});
