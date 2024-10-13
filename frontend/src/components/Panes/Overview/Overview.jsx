import * as Tabs from "@radix-ui/react-tabs";
import { PaneContainer } from "components/Utils/PaneContainer";
import { updateMapPosition } from "forks/xyflow/core/hooks/useViewportHelper";
import { useSettings } from "state/definitions";
import { localStorageFns } from "state/hooks/localStorage";
import { OVERVIEW } from "utils/constants";
import { usePaneFns } from "../paneFns";
import { InfoViewBig } from "./InfoViewBig";
import { ProjectConfigs } from "./ProjectConfigs";
import { ProjectOverview } from "./ProjectOverview";

export function Overview() {
  function onResizeStop(widthDiff) {
    if (useSettings.getState().leftSidePaneShiftsMap) {
      updateMapPosition(widthDiff);
    }
  }
  const { vis, width, setWidth, setTrueWidth, visToggle } = usePaneFns({
    paneName: OVERVIEW,
    onResizeStop,
  });

  function onClick() {
    visToggle();
  }

  return (
    <>
      <div className="absolute left-0 z-20 flex h-full w-12 flex-col items-center gap-1 bg-setta-900 py-2">
        <button
          className="flex h-10 w-10 cursor-pointer items-center justify-center text-setta-400 hover:text-setta-600 dark:text-setta-600 dark:hover:text-setta-500"
          onClick={onClick}
        >
          <i className="gg-list  !scale-100" />
        </button>
        <button
          className="flex h-10 w-10 cursor-pointer items-center justify-center text-setta-400 hover:text-setta-600 dark:text-setta-600 dark:hover:text-setta-500"
          onClick={onClick}
        >
          <i className="gg-info !scale-100" />
        </button>

        <button
          className="flex h-10 w-10 cursor-pointer items-center justify-center text-setta-400 hover:text-setta-600 dark:text-setta-600 dark:hover:text-setta-500"
          onClick={onClick}
        >
          <i className="gg-git-branch !scale-100" />
        </button>
      </div>
      <PaneContainer
        right={false}
        onResizeStop={onResizeStop}
        vis={vis}
        width={width}
        setWidth={setWidth}
        setTrueWidth={setTrueWidth}
        minimumWidth={350}
      >
        {vis && <TabsVisible />}
      </PaneContainer>
    </>
  );
}

function TabsVisible() {
  const [tab, setTab] = localStorageFns.overviewTab.hook();

  return (
    <Tabs.Root
      // className={`contents ${vis ? "visible" : "invisible"}`}
      value={tab}
      onValueChange={setTab}
      className="flex h-full min-h-0 w-[calc(100%_-_2rem)] min-w-0 flex-1 flex-col overflow-hidden pr-2"
    >
      <Tabs.List>
        <nav className="flex gap-4 overflow-x-auto">
          <TabItem name="Overview" value="tab1" />
          <TabItem name="Info" value="tab2" />
          <TabItem name="Configs" value="tab3" />
        </nav>
      </Tabs.List>
      <TabContent value="tab1">
        <ProjectOverview />
      </TabContent>
      <TabContent value="tab2">
        <InfoViewBig />
      </TabContent>
      <TabContent value="tab3">
        <ProjectConfigs />
      </TabContent>
    </Tabs.Root>
  );
}

function TabItem({ name, value }) {
  // border-b-2 isn't working for some reason. using border-bottom instead.
  // tab-index isn't working? can't tab to inactive tab
  return (
    <Tabs.Trigger
      className="mb-8 cursor-pointer select-none text-sm uppercase tracking-tight [border-bottom:3px_solid_transparent] [transition:font-weight_100ms_ease-in-out] hover:text-blue-800 focus-visible:ring-2 dark:text-setta-500 dark:hover:text-blue-500 [&[data-state='active']]:border-setta-500 [&[data-state='active']]:font-black [&[data-state='active']]:text-setta-500 [&[data-state='active']]:dark:border-setta-300 [&[data-state='active']]:dark:text-setta-300"
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
    <Tabs.Content value={value} asChild className="overflow-x-auto">
      {children}
    </Tabs.Content>
  );
}
