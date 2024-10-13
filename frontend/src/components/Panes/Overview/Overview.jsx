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
  const [tab, setTab] = localStorageFns.overviewTab.hook();
  const { vis, width, setWidth, setTrueWidth, getOnTabClick } = usePaneFns({
    paneName: OVERVIEW,
    onResizeStop,
    tab,
    setTab,
  });

  return (
    <>
      <div className="absolute left-0 z-20 flex h-full w-12 flex-col items-center gap-1 bg-setta-900 py-2">
        <button
          className="flex h-10 w-10 cursor-pointer items-center justify-center text-setta-400 hover:text-setta-600 dark:text-setta-600 dark:hover:text-setta-500"
          onClick={getOnTabClick("tab1")}
        >
          <i className="gg-list  !scale-100" />
        </button>
        <button
          className="flex h-10 w-10 cursor-pointer items-center justify-center text-setta-400 hover:text-setta-600 dark:text-setta-600 dark:hover:text-setta-500"
          onClick={getOnTabClick("tab2")}
        >
          <i className="gg-info !scale-100" />
        </button>

        <button
          className="flex h-10 w-10 cursor-pointer items-center justify-center text-setta-400 hover:text-setta-600 dark:text-setta-600 dark:hover:text-setta-500"
          onClick={getOnTabClick("tab3")}
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
        {vis && <TabsVisible tab={tab} />}
      </PaneContainer>
    </>
  );
}

function TabsVisible({ tab }) {
  return (
    <div
      className="flex h-full min-h-0 w-[calc(100%_-_2rem)] min-w-0 flex-1
    flex-col overflow-hidden pr-2"
    >
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
