import PaneContainer from "components/AppContainer/Main/PaneContainer/PaneContainer";
import { useGetOverviewListing } from "hooks/useGetOverviewListing";
import { useUpdateMapPosition } from "hooks/useUpdateMapPosition";
import { StandardSearch } from "utils/atoms/search/StandardSearch";
import { OVERVIEW } from "utils/constants";
import SectionListItems from "./SectionList/SectionListItems";

const paneProps = {
  right: false,
  paneName: OVERVIEW,
};

export default function Overview() {
  const [filteredList, setFilter] = useGetOverviewListing();

  const onResizeStop = useUpdateMapPosition();

  const inputStyles =
    "flex-grow outline-0 cursor-auto bg-transparent [border-width:0_0_1px_0] border-solid border-gray-300  focus-visible:border-blue-300 pl-7 py-1";

  return (
    <PaneContainer
      paneProps={paneProps}
      paneTitle="Overview"
      onResizeStop={onResizeStop}
    >
      <div className="pb-4">
        <StandardSearch
          inputStyles={inputStyles}
          leftElementStyles="pl-1"
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Overview Search"
        />
      </div>
      <SectionListItems listOfSectionIdsAndNames={filteredList} />
    </PaneContainer>
  );
}
