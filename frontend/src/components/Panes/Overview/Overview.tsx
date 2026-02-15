import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import { PaneContainer } from "components/Utils/PaneContainer";
import Controls from "forks/xyflow/controls/Controls";
import {
  usePluginPaneTabs,
  type PluginPaneIconName,
  type PluginPaneTabEntry,
} from "plugins/runtime";
import { useMemo, useRef, type ReactElement, type RefObject } from "react";
import { HiOutlineEye } from "react-icons/hi";
import { IoChatbox } from "react-icons/io5";
import {
  MdBugReport,
  MdExtension,
  MdNotificationsNone,
  MdOutlineSmartToy,
} from "react-icons/md";
import { RiGitCommitLine, RiPlayList2Fill, RiRadarLine } from "react-icons/ri";
import { TbFolder, TbLayoutDashboard } from "react-icons/tb";
import {
  useBackendLogEvents,
  useLocalStorage,
  useShareSession,
} from "state/definitions";
import { useHasViewModeTabs } from "state/hooks/viewModes";
import {
  OverviewTabKey,
  OverviewTabName,
  OverviewTabNameEnum,
  OverviewTabNamePrettified,
  PaneNameEnum,
  parsePluginPaneOverviewTabName,
} from "utils/constants";
import { useTabScope } from "utils/focusManager";
import {
  onOverviewResizeStop,
  onOverviewTabClick,
  TabButton,
} from "../paneFns";
import { AppConfigPane } from "./App/AppConfigPane";
import { BackendLogEventsArea } from "./BackendLogEventsArea";
import { FileBrowserPane } from "./FileBrowser/FileBrowserPane";
import { GitPane } from "./Git/GitPane";
import { NotificationsArea } from "./NotificationsArea";
import { PluginOverviewPane } from "./Plugins/PluginOverviewPane";
import { PluginsPane } from "./Plugins/PluginsPane";
import { ProjectConfigs } from "./ProjectConfigs";
import { ProjectAISettings } from "./ProjectLevelAI/ProjectAISettings";
import { ProjectChat } from "./ProjectLevelAI/ProjectChat";
import { ProjectOverview } from "./ProjectOverview/ProjectOverview";
import { RunInstructions } from "./RunInstructions";
import { ViewingEditingMode } from "./ViewingEditingMode";
import { WatchCodePane } from "./WatchCode/WatchCodePane";

const FILE_BROWSER_META_INSET_CLASS = "mx-auto w-[calc(100%_-_1.5rem)] pl-1.5";
const FILE_BROWSER_LIST_INSET_LEFT = 10;

export function Overview() {
  const overviewRef = useRef<HTMLDivElement>(null);
  useTabScope({
    scopeId: "overview",
    order: 10,
    rootRef: overviewRef as RefObject<HTMLElement>,
  });
  const hasViewModeTabs = useHasViewModeTabs();
  const { selectedTabName, vis, width } = useLocalStorage((x) => ({
    selectedTabName: x.overviewTab,
    vis: x.overviewVis,
    width: x.overviewWidth,
  }));
  const pluginPaneTabs = usePluginPaneTabs();
  const pluginPaneTabByKey = useMemo(() => {
    const values: Record<string, PluginPaneTabEntry> = {};
    for (const pluginPaneTab of pluginPaneTabs) {
      values[pluginPaneTab.tabKey] = pluginPaneTab;
    }
    return values;
  }, [pluginPaneTabs]);
  const { isDeploymentMode, allowLLM } = useShareSession((x) => ({
    isDeploymentMode: x.isDeploymentMode,
    allowLLM: x.sharePolicy?.allowLLM ?? false,
  }));
  const showFileBrowserTab = !isDeploymentMode;
  const showGitTab = !isDeploymentMode;
  const showWatchCodeTab = !isDeploymentMode;
  const showAppTab = !isDeploymentMode;
  const showLLMTabs = !isDeploymentMode || allowLLM;
  let effectiveTabName = selectedTabName;
  const selectedPluginPaneTab = pluginPaneTabByKey[selectedTabName] ?? null;
  const selectedTabIsPluginPane =
    parsePluginPaneOverviewTabName(selectedTabName) !== null;
  if (selectedTabIsPluginPane && !selectedPluginPaneTab) {
    effectiveTabName = OverviewTabNameEnum.Plugins;
  }
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
  if (!showGitTab && selectedTabName === OverviewTabNameEnum.Git) {
    effectiveTabName = OverviewTabNameEnum.Overview;
  }
  if (!showWatchCodeTab && selectedTabName === OverviewTabNameEnum.WatchCode) {
    effectiveTabName = OverviewTabNameEnum.Overview;
  }
  if (!showAppTab && selectedTabName === OverviewTabNameEnum.App) {
    effectiveTabName = OverviewTabNameEnum.Overview;
  }
  const effectivePluginPaneTab = pluginPaneTabByKey[effectiveTabName] ?? null;
  const isFileBrowserTab = effectiveTabName === OverviewTabNameEnum.FileBrowser;
  const hasUnreadHighSeverityBackendLogs = useBackendLogEvents(
    (state) => state.unreadHighSeverityCount > 0,
  );
  const commonProps = {
    vis,
    selectedTabName: effectiveTabName,
    onTabClick: onOverviewTabClick,
    className:
      "flex h-8 w-8 cursor-pointer items-center justify-center focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-light-blue-500",
    requiredTabs: null,
  };

  return (
    <div
      id="OverviewPane"
      className="contents"
      ref={overviewRef}
      data-tab-scope="overview"
    >
      <div
        data-testid="overview-icon-rail"
        className="fixed left-0 z-[19] flex w-10 flex-col items-center gap-1 border-r border-setta-200/75 bg-setta-50 py-2 dark:border-setta-850 dark:bg-setta-900"
        style={{
          top: "calc(var(--setta-titlebar-height) + 36px)",
          bottom: hasViewModeTabs ? "36px" : "0px",
        }}
      >
        <TabButton<OverviewTabKey>
          id="overview-tab-overview"
          tabName={OverviewTabNameEnum.Overview}
          {...commonProps}
          {...getFloatingBoxHandlers({ content: "Project Overview" })}
          icon={<i className="gg-list  !scale-100" />}
        />
        <TabButton<OverviewTabKey>
          id="overview-tab-plugins"
          tabName={OverviewTabNameEnum.Plugins}
          {...commonProps}
          {...getFloatingBoxHandlers({ content: "Plugins" })}
          icon={<MdExtension size={18} />}
        />
        {pluginPaneTabs.map((pluginPaneTab) => (
          <TabButton<OverviewTabKey>
            key={pluginPaneTab.tabKey}
            id={`overview-plugin-pane-tab-${encodeURIComponent(pluginPaneTab.pluginId)}-${encodeURIComponent(pluginPaneTab.paneId)}`}
            tabName={pluginPaneTab.tabKey}
            {...commonProps}
            {...getFloatingBoxHandlers({
              content: `${pluginPaneTab.title} (${pluginPaneTab.pluginId})`,
            })}
            icon={renderPluginPaneTabIcon(pluginPaneTab.icon)}
          />
        ))}
        {showFileBrowserTab && (
          <TabButton<OverviewTabKey>
            tabName={OverviewTabNameEnum.FileBrowser}
            {...commonProps}
            {...getFloatingBoxHandlers({ content: "Explorer" })}
            icon={<TbFolder size={18} />}
          />
        )}
        {showGitTab && (
          <TabButton<OverviewTabKey>
            tabName={OverviewTabNameEnum.Git}
            {...commonProps}
            {...getFloatingBoxHandlers({ content: "Git" })}
            icon={<RiGitCommitLine size={18} />}
          />
        )}
        {showWatchCodeTab && (
          <TabButton<OverviewTabKey>
            tabName={OverviewTabNameEnum.WatchCode}
            {...commonProps}
            {...getFloatingBoxHandlers({ content: "Watch Code" })}
            icon={<RiRadarLine size={18} />}
          />
        )}
        {showAppTab && (
          <TabButton<OverviewTabKey>
            tabName={OverviewTabNameEnum.App}
            {...commonProps}
            {...getFloatingBoxHandlers({ content: "App" })}
            icon={<TbLayoutDashboard size={18} />}
          />
        )}
        <TabButton<OverviewTabKey>
          tabName={OverviewTabNameEnum.ProjectConfigs}
          {...commonProps}
          {...getFloatingBoxHandlers({ content: "Config Preview" })}
          icon={<i className="gg-git-branch !scale-100" />}
        />
        <TabButton<OverviewTabKey>
          tabName={OverviewTabNameEnum.RunInstructions}
          {...commonProps}
          {...getFloatingBoxHandlers({ content: "Custom Runs" })}
          icon={<RiPlayList2Fill size={20} />}
        />
        <TabButton<OverviewTabKey>
          tabName={OverviewTabNameEnum.ViewModes}
          {...commonProps}
          {...getFloatingBoxHandlers({ content: "Viewing/Editing Mode" })}
          icon={<HiOutlineEye size={20} />}
        />
        <TabButton<OverviewTabKey>
          tabName={OverviewTabNameEnum.Notifications}
          {...commonProps}
          {...getFloatingBoxHandlers({ content: "Notifications" })}
          icon={<MdNotificationsNone size={20} />}
        />
        <TabButton<OverviewTabKey>
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
          <TabButton<OverviewTabKey>
            tabName={OverviewTabNameEnum.ProjectAIChat}
            {...commonProps}
            {...getFloatingBoxHandlers({ content: "ProjectAI Chat" })}
            icon={<IoChatbox size={20} />}
          />
        )}
        {showLLMTabs && (
          <TabButton<OverviewTabKey>
            tabName={OverviewTabNameEnum.ProjectAISettings}
            {...commonProps}
            {...getFloatingBoxHandlers({ content: "ProjectAI Chat" })}
            icon={<MdOutlineSmartToy size={20} />}
          />
        )}
        <Controls />
      </div>
      <PaneContainer
        paneName={PaneNameEnum.overview}
        right={false}
        onResizeStop={onOverviewResizeStop}
        vis={vis}
        width={width}
        minimumWidth={250}
        {...(isFileBrowserTab ? { paddingClassName: "pt-2.5 pb-0" } : {})}
      >
        {vis && (
          <TabsVisible
            selectedTabName={effectiveTabName}
            selectedPluginPaneTab={effectivePluginPaneTab}
          />
        )}
      </PaneContainer>
    </div>
  );
}

function renderPluginPaneTabIcon(
  iconName: PluginPaneIconName | undefined,
): ReactElement {
  switch (iconName) {
    case "folder":
      return <TbFolder size={14} className="setta-plugin-pane-icon--folder" />;
    case "git":
      return (
        <RiGitCommitLine size={14} className="setta-plugin-pane-icon--git" />
      );
    case "radar":
      return (
        <RiRadarLine size={14} className="setta-plugin-pane-icon--radar" />
      );
    case "dashboard":
      return (
        <TbLayoutDashboard
          size={14}
          className="setta-plugin-pane-icon--dashboard"
        />
      );
    case "eye":
      return <HiOutlineEye size={14} className="setta-plugin-pane-icon--eye" />;
    case "notifications":
      return (
        <MdNotificationsNone
          size={14}
          className="setta-plugin-pane-icon--notifications"
        />
      );
    case "bug":
      return <MdBugReport size={14} className="setta-plugin-pane-icon--bug" />;
    case "chat":
      return <IoChatbox size={14} className="setta-plugin-pane-icon--chat" />;
    case "robot":
      return (
        <MdOutlineSmartToy
          size={14}
          className="setta-plugin-pane-icon--robot"
        />
      );
    case "extension":
    default:
      return (
        <MdExtension size={14} className="setta-plugin-pane-icon--extension" />
      );
  }
}

function TabsVisible({
  selectedTabName,
  selectedPluginPaneTab,
}: {
  selectedTabName: OverviewTabKey;
  selectedPluginPaneTab: PluginPaneTabEntry | null;
}) {
  const title = selectedPluginPaneTab
    ? selectedPluginPaneTab.title
    : resolveOverviewTitle(selectedTabName);
  const isFullWidth = selectedTabName === OverviewTabNameEnum.FileBrowser;
  return (
    <div
      className={
        isFullWidth
          ? "flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden"
          : "mx-[1px] flex h-full min-h-0 w-[calc(100%_-_1.5rem)] min-w-0 flex-1 flex-col overflow-hidden pl-1.5"
      }
    >
      {isFullWidth ? (
        <div className={FILE_BROWSER_META_INSET_CLASS}>
          <h2 className="mb-1 cursor-pointer select-none text-xs font-bold uppercase tracking-tight text-setta-300 dark:text-setta-500">
            {title}
          </h2>
        </div>
      ) : (
        <h2 className="mb-1 cursor-pointer select-none text-xs font-bold uppercase tracking-tight text-setta-300 dark:text-setta-500">
          {title}
        </h2>
      )}
      <TabContent
        selectedTabName={selectedTabName}
        selectedPluginPaneTab={selectedPluginPaneTab}
      />
    </div>
  );
}

function TabContent({
  selectedTabName,
  selectedPluginPaneTab,
}: {
  selectedTabName: OverviewTabKey;
  selectedPluginPaneTab: PluginPaneTabEntry | null;
}) {
  if (selectedPluginPaneTab) {
    return (
      <PluginOverviewPane
        pluginId={selectedPluginPaneTab.pluginId}
        paneId={selectedPluginPaneTab.paneId}
      />
    );
  }

  switch (selectedTabName) {
    case OverviewTabNameEnum.Overview:
      return <ProjectOverview />;
    case OverviewTabNameEnum.Plugins:
      return <PluginsPane />;
    case OverviewTabNameEnum.FileBrowser:
      return (
        <FileBrowserPane
          metaPaddingClassName={FILE_BROWSER_META_INSET_CLASS}
          listInsetLeft={FILE_BROWSER_LIST_INSET_LEFT}
        />
      );
    case OverviewTabNameEnum.Git:
      return <GitPane />;
    case OverviewTabNameEnum.ProjectConfigs:
      return <ProjectConfigs />;
    case OverviewTabNameEnum.WatchCode:
      return <WatchCodePane />;
    case OverviewTabNameEnum.App:
      return <AppConfigPane />;
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
    case OverviewTabNameEnum.ProjectAISettings:
      return <ProjectAISettings />;
    default:
      return <ProjectOverview />;
  }
}

function resolveOverviewTitle(selectedTabName: OverviewTabKey): string {
  if (selectedTabName in OverviewTabNamePrettified) {
    return OverviewTabNamePrettified[selectedTabName as OverviewTabName];
  }
  return OverviewTabNamePrettified[OverviewTabNameEnum.Overview];
}
