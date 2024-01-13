import * as Tabs from "@radix-ui/react-tabs";
import { ProjectName } from "components/AppContainer/Header/SubNav/ProjectName/ProjectName";
import { PaneContainer } from "components/AppContainer/Main/PaneContainer/PaneContainer";
import { useGetOverviewListing } from "hooks/useGetOverviewListing";
import {
  constInfoViews,
  useCurrInfoView,
  useSetCurrInfoView,
} from "models/info/infoView";
import React from "react";
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
  return (
    <PaneContainer
      paneProps={paneProps}
      paneTitle="Overview"
      onResizeStop={updateMapPosition}
    >
      <TabsVisible />
    </PaneContainer>
  );
}

function TabsVisible({ sectionId }) {
  return (
    <Tabs.Root
      // className={`contents ${vis ? "visible" : "invisible"}`}
      defaultValue="tab1"
      // defaultValue={SECTION_CONFIG_TAB}
      // value={tab}
      // onValueChange={setTab}
      className="flex flex-1 flex-col"
    >
      <Tabs.List>
        <nav className="flex gap-4">
          <TabItem name="Overview" value="tab1" />
          <TabItem name="Info" value="tab2" />
        </nav>
      </Tabs.List>
      <TabContent value="tab1">
        <ProjectOverview />
      </TabContent>
      <TabContent value="tab2">
        <InfoViewBig />
      </TabContent>
    </Tabs.Root>
  );
}

function TabItem({ name, value }) {
  // border-b-2 isn't working for some reason. using border-bottom instead.
  // tab-index isn't working? can't tab to inactive tab
  return (
    <Tabs.Trigger
      className="my-4 cursor-pointer select-none font-heading text-lg uppercase tracking-tight [border-bottom:3px_solid_transparent] focus-visible:ring-2 dark:text-runcoder-400 [&[data-state='active']]:border-runcoder-500 [&[data-state='active']]:font-bold"
      value={value}
      tab-index="0"
    >
      {name}
    </Tabs.Trigger>
  );
}

function TabContent(props) {
  const { children, value } = props;
  return (
    <Tabs.Content value={value} asChild>
      {children}
    </Tabs.Content>
  );
}

const ProjectOverview = React.forwardRef(() => {
  const [filteredList, setFilter] = useGetOverviewListing();
  const infoViewHandlers = useSetCurrInfoView(constInfoViews.OVERVIEW);
  const infoViewHandlersSearch = useSetCurrInfoView(
    constInfoViews.OVERVIEW_SEARCH
  );
  return (
    <>
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
    </>
  );
});

const InfoViewBig = React.forwardRef(() => {
  const currInfoView = useCurrInfoView();
  return (
    <aside className="self-start overflow-clip text-runcoder-500 dark:text-runcoder-200">
      {currInfoView}
    </aside>
  );
});
