import { PaneContainer } from "components/Utils/PaneContainer";
import { updateMapPosition } from "forks/xyflow/core/hooks/useViewportHelper";
import { useSettings } from "state/definitions";
import { localStorageFns } from "state/hooks/localStorage";
import { OVERVIEW } from "utils/constants";
import { overviewPaneOnKeyDown } from "utils/tabbingLogic";
import { TabButton, usePaneFns } from "../paneFns";
import { InfoViewBig } from "./InfoViewBig";
import { ProjectConfigs } from "./ProjectConfigs";
import { ProjectOverview } from "./ProjectOverview";

export function Overview() {
  function onResizeStop(widthDiff) {
    if (useSettings.getState().leftSidePaneShiftsMap) {
      updateMapPosition(widthDiff);
    }
  }
  const [tab, setTab] = localStorageFns.overviewTab.hook();
  const { vis, width, setWidth, setTrueWidth, getOnTabClick } = usePaneFns({
    paneName: OVERVIEW,
    onResizeStop,
    tab,
    setTab,
  });
  const commonProps = {
    vis,
    tab,
    getOnTabClick,
    className:
      "flex h-10 w-10 cursor-pointer items-center justify-center focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-light-blue-500",
  };

  // The ProjectOverviewButtonDiv div id is used when tabbing from document.body
  return (
    <div
      id="OverviewPane"
      className="contents"
      onKeyDown={overviewPaneOnKeyDown}
    >
      <div className="absolute left-0 z-[19] flex h-full w-12 flex-col items-center gap-1 border-r border-setta-200/75 bg-setta-50 py-3 dark:border-setta-850 dark:bg-setta-900">
        <TabButton tabName="tab1" {...commonProps}>
          <i className="gg-list  !scale-100" />
        </TabButton>
        <TabButton tabName="tab2" {...commonProps}>
          <i className="gg-info !scale-100" />
        </TabButton>
        <TabButton tabName="tab3" {...commonProps}>
          <i className="gg-git-branch !scale-100" />
        </TabButton>
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
        {vis && <TabsVisible tab={tab} />}
      </PaneContainer>
    </div>
  );
}

function TabsVisible({ tab }) {
  // const title = tabNameToPretty[tab];
  const title = { tab1: "Overview", tab2: "Info", tab3: "Project Configs" }[
    tab
  ];
  return (
    <div
      className="mx-[1px] flex h-full min-h-0 w-[calc(100%_-_3rem)] min-w-0 flex-1
    flex-col overflow-hidden pl-1.5"
    >
      <h2 className="mb-1 cursor-pointer select-none text-xs font-bold uppercase tracking-tight text-setta-300 dark:text-setta-500">
        {title}
      </h2>
      <TabContent tab={tab} />
    </div>
  );
}

function TabContent({ tab }) {
  switch (tab) {
    case "tab1":
      return <ProjectOverview />;
    case "tab2":
      return <InfoViewBig />;
    case "tab3":
      return <ProjectConfigs />;
  }
}
