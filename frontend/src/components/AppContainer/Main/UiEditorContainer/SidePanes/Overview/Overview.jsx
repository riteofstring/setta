import { ProjectName } from "components/AppContainer/Header/SubNav/ProjectName/ProjectName";
import { PaneContainer } from "components/AppContainer/Main/PaneContainer/PaneContainer";
import { useGetOverviewListing } from "hooks/useGetOverviewListing";
import { useUpdateMapPosition } from "hooks/useUpdateMapPosition";
import { ConstantInfoView, useSetCurrInfoView } from "models/info/infoView";
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
  const onResizeStop = useUpdateMapPosition();
  const infoViewHandlers = useSetCurrInfoView(ConstantInfoView.OVERVIEW);
  const infoViewHandlersSearch = useSetCurrInfoView(
    ConstantInfoView.OVERVIEW_SEARCH
  );

  return (
    <PaneContainer
      paneProps={paneProps}
      paneTitle="Overview"
      onResizeStop={onResizeStop}
    >
      <ProjectName />

      <StandardSearch
        inputStyles="flex-grow outline-0 cursor-auto bg-transparent [border-width:0_0_1px_0] border-solid border-slate-300 dark:border-runcoder-800  focus-visible:border-blue-300 pl-7 py-1"
        outerClasses="pb-4"
        leftElementStyles="pl-1"
        onChange={(e) => setFilter(e.target.value)}
        aria-label="Overview Search"
        {...infoViewHandlersSearch}
      />

      <ScrollingArea styles="flex-1">
        <ul className="flex-grow" {...infoViewHandlers}>
          <SectionListItems listOfSectionIdsAndNames={filteredList} />
        </ul>
      </ScrollingArea>
      <InfoView />
    </PaneContainer>
  );
}
