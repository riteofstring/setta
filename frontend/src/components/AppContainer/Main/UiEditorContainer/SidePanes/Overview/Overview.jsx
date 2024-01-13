import { ProjectName } from "components/AppContainer/Header/SubNav/ProjectName/ProjectName";
import { PaneContainer } from "components/AppContainer/Main/PaneContainer/PaneContainer";
import { useGetOverviewListing } from "hooks/useGetOverviewListing";
import { constInfoViews, useSetCurrInfoView } from "models/info/infoView";
import { BiFilter } from "react-icons/bi";
import { updateMapPosition } from "thunks/updateMapPosition";
import { ScrollingArea } from "utils/atoms/scrollingarea/scrollingarea";
import { StandardSearch } from "utils/atoms/search/StandardSearch";
import { OVERVIEW } from "utils/constants";
import { InfoView } from "./InfoView/InfoView";
import { SectionListItems } from "./SectionList/SectionListItems";

const paneProps = {
  right: false,
  paneName: OVERVIEW,
  initialWidth: 335,
};

export function Overview() {
  const [filteredList, setFilter] = useGetOverviewListing();
  const infoViewHandlers = useSetCurrInfoView(constInfoViews.OVERVIEW);
  const infoViewHandlersSearch = useSetCurrInfoView(
    constInfoViews.OVERVIEW_SEARCH
  );

  return (
    <PaneContainer
      paneProps={paneProps}
      paneTitle="Overview"
      onResizeStop={updateMapPosition}
    >
      <ProjectName />

      <StandardSearch
        inputStyles="flex-grow outline-0 cursor-auto bg-transparent [border-width:0_0_1px_0] border-solid border-runcoder-200 dark:border-runcoder-800  focus-visible:border-blue-300 pl-7 py-1"
        outerClasses="pb-4"
        leftElementStyles="pl-1"
        placeholder="Filter"
        leftElement={
          <BiFilter className="text-runcoder-600 dark:text-runcoder-400" />
        }
        onChange={(e) => setFilter(e.target.value)}
        aria-label="Overview Search"
        {...infoViewHandlersSearch}
      />

      <ScrollingArea styles="flex-1 -mx-2 px-2">
        <ul className="flex-grow" {...infoViewHandlers}>
          <SectionListItems listOfSectionIdsAndNames={filteredList} />
        </ul>
      </ScrollingArea>
      <InfoView />
    </PaneContainer>
  );
}
