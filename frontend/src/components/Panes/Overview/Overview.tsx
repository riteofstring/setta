import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import { PaneContainer } from "components/Utils/PaneContainer";
import Controls from "forks/xyflow/controls/Controls";
import { useRef } from "react";
import { BiHelpCircle } from "react-icons/bi";
import { HiOutlineEye } from "react-icons/hi";
import { IoChatbox } from "react-icons/io5";
import {
  MdBugReport,
  MdNotificationsNone,
  MdOutlineSmartToy,
} from "react-icons/md";
import { RiPlayList2Fill } from "react-icons/ri";
import { TbFolder } from "react-icons/tb";
import {
  useBackendLogEvents,
  useLocalStorage,
  useShareSession,
} from "state/definitions";
import {
  OverviewTabName,
  OverviewTabNameEnum,
  OverviewTabNamePrettified,
  PaneNameEnum,
} from "utils/constants";
import { useTabScope } from "utils/focusManager";
import {
  onOverviewResizeStop,
  onOverviewTabClick,
  TabButton,
} from "../paneFns";
import { BackendLogEventsArea } from "./BackendLogEventsArea";
import { FileBrowserPane } from "./FileBrowser/FileBrowserPane";
import { NotificationsArea } from "./NotificationsArea";
import { ProjectConfigs } from "./ProjectConfigs";
import { ProjectChat } from "./ProjectLevelAI/ProjectChat";
import { ProjectOverview } from "./ProjectOverview/ProjectOverview";
import { RunInstructions } from "./RunInstructions";
import { ViewingEditingMode } from "./ViewingEditingMode";

export function Overview() {
  const overviewRef = useRef<HTMLDivElement>(null);
  useTabScope({
    scopeId: "overview",
    order: 10,
    rootRef: overviewRef,
  });
  const { selectedTabName, vis, width } = useLocalStorage((x) => ({
    selectedTabName: x.overviewTab,
    vis: x.overviewVis,
    width: x.overviewWidth,
  }));
  const { isShareMode, allowLLM } = useShareSession((x) => ({
    isShareMode: x.isShareMode,
    allowLLM: x.sharePolicy?.allowLLM ?? false,
  }));
  const showFileBrowserTab = !isShareMode;
  const showLLMTabs = !isShareMode || allowLLM;
  let effectiveTabName = selectedTabName;
  if (!showLLMTabs) {
    if (
      selectedTabName === OverviewTabNameEnum.ProjectAIChat ||
      selectedTabName === OverviewTabNameEnum.ProjectAISettings
    ) {
      effectiveTabName = OverviewTabNameEnum.Overview;
    }
  }
  if (
    !showFileBrowserTab &&
    selectedTabName === OverviewTabNameEnum.FileBrowser
  ) {
    effectiveTabName = OverviewTabNameEnum.Overview;
  }
  const hasUnreadHighSeverityBackendLogs = useBackendLogEvents(
    (state) => state.unreadHighSeverityCount > 0,
  );
  const commonProps = {
    vis,
    selectedTabName: effectiveTabName,
    onTabClick: onOverviewTabClick,
    className:
      "flex h-10 w-10 cursor-pointer items-center justify-center focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-light-blue-500",
    requiredTabs: null,
  };

  return (
    <div
      id="OverviewPane"
      className="contents"
      ref={overviewRef}
      data-tab-scope="overview"
    >
      <div className="absolute left-0 z-[19] flex h-[calc(100%_-_48px)] w-[50px] flex-col items-center gap-1 border-r border-setta-200/75 bg-setta-50 py-3 dark:border-setta-850 dark:bg-setta-900">
        <TabButton<OverviewTabName>
          tabName={OverviewTabNameEnum.Overview}
          {...commonProps}
          {...getFloatingBoxHandlers({ content: "Project Overview" })}
          icon={<i className="gg-list  !scale-100" />}
        />
        {showFileBrowserTab && (
          <TabButton<OverviewTabName>
            tabName={OverviewTabNameEnum.FileBrowser}
            {...commonProps}
            {...getFloatingBoxHandlers({ content: "Explorer" })}
            icon={<TbFolder size={18} />}
          />
        )}
        <TabButton<OverviewTabName>
          tabName={OverviewTabNameEnum.ProjectConfigs}
          {...commonProps}
          {...getFloatingBoxHandlers({ content: "Config Preview" })}
          icon={<i className="gg-git-branch !scale-100" />}
        />
        <TabButton<OverviewTabName>
          tabName={OverviewTabNameEnum.RunInstructions}
          {...commonProps}
          {...getFloatingBoxHandlers({ content: "Custom Runs" })}
          icon={<RiPlayList2Fill size={20} />}
        />
        <TabButton<OverviewTabName>
          tabName={OverviewTabNameEnum.ViewModes}
          {...commonProps}
          {...getFloatingBoxHandlers({ content: "Viewing/Editing Mode" })}
          icon={<HiOutlineEye size={20} />}
        />
        <TabButton<OverviewTabName>
          tabName={OverviewTabNameEnum.Notifications}
          {...commonProps}
          {...getFloatingBoxHandlers({ content: "Notifications" })}
          icon={<MdNotificationsNone size={20} />}
        />
        <TabButton<OverviewTabName>
          tabName={OverviewTabNameEnum.BackendLogs}
          {...commonProps}
          {...getFloatingBoxHandlers({ content: "Backend Logs" })}
          icon={
            <div className="relative">
              <MdBugReport size={20} />
              {hasUnreadHighSeverityBackendLogs && (
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500 dark:bg-red-400" />
              )}
            </div>
          }
        />
        {showLLMTabs && (
          <TabButton<OverviewTabName>
            tabName={OverviewTabNameEnum.ProjectAIChat}
            {...commonProps}
            {...getFloatingBoxHandlers({ content: "ProjectAI Chat" })}
            icon={<IoChatbox size={20} />}
          />
        )}
        {showLLMTabs && (
          <TabButton<OverviewTabName>
            tabName={OverviewTabNameEnum.ProjectAISettings}
            {...commonProps}
            {...getFloatingBoxHandlers({ content: "ProjectAI Chat" })}
            icon={<MdOutlineSmartToy size={20} />}
          />
        )}
        <Controls />
        <a
          href="https://docs.setta.dev"
          target="_blank"
          className="focus-visible:ring-light-blue-500 absolute bottom-2 left-1 flex h-10 w-10 cursor-pointer items-center justify-center text-setta-400 hover:text-setta-600 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 dark:text-setta-600 dark:hover:text-setta-500"
          rel="noreferrer"
        >
          <BiHelpCircle />
        </a>
      </div>
      <PaneContainer
        paneName={PaneNameEnum.overview}
        right={false}
        onResizeStop={onOverviewResizeStop}
        vis={vis}
        width={width}
        minimumWidth={250}
      >
        {vis && <TabsVisible selectedTabName={effectiveTabName} />}
      </PaneContainer>
    </div>
  );
}

function TabsVisible({
  selectedTabName,
}: {
  selectedTabName: OverviewTabName;
}) {
  const title = OverviewTabNamePrettified[selectedTabName];
  return (
    <div
      className="mx-[1px] flex h-full min-h-0 w-[calc(100%_-_3rem)] min-w-0 flex-1
    flex-col overflow-hidden pl-1.5"
    >
      <h2 className="mb-1 cursor-pointer select-none text-xs font-bold uppercase tracking-tight text-setta-300 dark:text-setta-500">
        {title}
      </h2>
      <TabContent selectedTabName={selectedTabName} />
    </div>
  );
}

function TabContent({ selectedTabName }: { selectedTabName: OverviewTabName }) {
  switch (selectedTabName) {
    case OverviewTabNameEnum.Overview:
      return <ProjectOverview />;
    case OverviewTabNameEnum.FileBrowser:
      return <FileBrowserPane />;
    case OverviewTabNameEnum.ProjectConfigs:
      return <ProjectConfigs />;
    case OverviewTabNameEnum.RunInstructions:
      return <RunInstructions />;
    case OverviewTabNameEnum.ViewModes:
      return <ViewingEditingMode />;
    case OverviewTabNameEnum.Notifications:
      return <NotificationsArea />;
    case OverviewTabNameEnum.BackendLogs:
      return <BackendLogEventsArea />;
    case OverviewTabNameEnum.ProjectAIChat:
      return <ProjectChat />;
    // case OverviewTabNameEnum.ProjectAISettings:
    // return <ProjectLLMSettings />;
    default:
      return selectedTabName satisfies never;
  }
}
