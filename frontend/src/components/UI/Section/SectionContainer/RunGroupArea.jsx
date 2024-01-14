import { SectionListItems } from "components/AppContainer/Main/UiEditorContainer/SidePanes/Overview/SectionList/SectionListItems";
import { useGetOverviewListing } from "hooks/useGetOverviewListing";
import { constInfoViews, useSetCurrInfoView } from "models/info/infoView";
import { BiFilter } from "react-icons/bi";
import { TbVersions } from "react-icons/tb";
import { Button } from "utils/atoms/buttons/Button";
import { StandardSearch } from "utils/atoms/search/StandardSearch";

export function RunGroupArea() {
  const [filteredList, setFilter] = useGetOverviewListing();
  const infoViewHandlers = useSetCurrInfoView(constInfoViews.OVERVIEW);
  const infoViewHandlersSearch = useSetCurrInfoView(
    constInfoViews.OVERVIEW_SEARCH
  );
  return (
    <>
      <StandardSearch
        inputStyles="text-xs flex-grow outline-0 cursor-auto bg-transparent [border-width:0_0_1px_0] border-solid border-runcoder-200 dark:border-runcoder-700 focus-visible:!border-blue-300 pl-7 py-1"
        outerClasses="card-filter-full-width"
        leftElementStyles="pl-1"
        placeholder="Filter"
        leftElement={
          <BiFilter className="text-runcoder-600 dark:text-runcoder-400" />
        }
        onChange={(e) => setFilter(e.target.value)}
        aria-label="Overview Search"
        {...infoViewHandlersSearch}
      />
      <section className="card-rungroup-overview nowheel noscroll overflow-y-auto overflow-x-clip">
        <ul className=" col-span-2" {...infoViewHandlers}>
          <SectionListItems
            listOfSectionIdsAndNames={filteredList}
            checkbox={true}
          />
        </ul>
      </section>

      <Button
        grid={false}
        twClasses="card-configs-btn backdrop-blur-[2px] px-2 py-1 self-center text-runcoder-700 dark:text-runcoder-300 dark:bg-runcoder-900/40 hover:bg-white dark:hover:bg-runcoder-900 rounded-full gap-1 font-heading uppercase border-2 border-solid border-white dark:border-runcoder-800 text-xs bgruncoder-200/25 shadow-md hover:shadow-lg z-50"
      >
        <TbVersions className="z-[3] h-4 w-4" />
        Versions
      </Button>
    </>
  );
}
