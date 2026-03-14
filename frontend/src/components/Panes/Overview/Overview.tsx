import * as Menubar from "@radix-ui/react-menubar";
import { NavbarMenuDropdown } from "components/Utils/atoms/menubar/menudropdown";
import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
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
import { IoMdGitBranch } from "react-icons/io";
import { IoChatbox, IoSettingsOutline } from "react-icons/io5";
import {
  MdBugReport,
  MdExtension,
  MdMoreHoriz,
  MdNotificationsNone,
  MdOutlineSmartToy,
} from "react-icons/md";
import { RiGitCommitLine, RiPlayList2Fill, RiRadarLine } from "react-icons/ri";
import { TbFolder, TbLayoutDashboard } from "react-icons/tb";
import { Link } from "react-router-dom";
import {
  useBackendLogEvents,
  useLocalStorage,
  useShareSession,
} from "state/definitions";
import { useHasViewModeTabs } from "state/hooks/viewModes";
import {
  APP_CHROME_Z_INDEX_CLASS_NAME,
  APP_MENU_Z_INDEX_CLASS_NAME,
  OverviewTabKey,
  OverviewTabName,
  OverviewTabNameEnum,
  OverviewTabNamePrettified,
  PAGE_LOAD_TYPES,
  PaneNameEnum,
  parsePluginPaneOverviewTabName,
  SETTINGS_ROUTER_PATH,
} from "utils/constants";
import { useTabScope } from "utils/focusManager";
import {
  onOverviewResizeStop,
  onOverviewTabClick,
  TabButton,
} from "../paneFns";
import { getPaneMinimumWidth } from "../paneLayout";
import { AppConfigPane } from "./App/AppConfigPane";
import { FileBrowserWorkspace } from "./FileBrowser/FileBrowserWorkspace";
import { GitPane } from "./Git/GitPane";
import { NotificationsArea } from "./NotificationsArea";
import { PluginOverviewPane } from "./Plugins/PluginOverviewPane";
import { PluginsPane } from "./Plugins/PluginsPane";
import { ProjectAISettings } from "./ProjectLevelAI/ProjectAISettings";
import { ProjectChat } from "./ProjectLevelAI/ProjectChat";
import { ProjectOverview } from "./ProjectOverview/ProjectOverview";
import { RunInstructions } from "./RunInstructions";
import { ViewingEditingMode } from "./ViewingEditingMode";

const FILE_BROWSER_META_INSET_CLASS = "mx-auto w-[calc(100%_-_1.5rem)] px-1.5";
const FILE_BROWSER_LIST_INSET_LEFT = 10;
export const OVERVIEW_MORE_MENU_CONTENT_CLASS_NAME = `${APP_MENU_Z_INDEX_CLASS_NAME} min-w-[180px] rounded-md border border-solid border-setta-100 bg-white p-1 shadow-xl transition-all will-change-[transform,opacity] dark:border-setta-700/50 dark:bg-setta-850`;
const JSON_RENDER_OVERVIEW_QUICK_INFO = {
  title:
    "Advanced app-definition workbench for previewing, validating, saving, and editing the current app spec.",
  moreMenu:
    "Use Project Chat slash commands like /app-json, /app-image, /app-prompt, and /app-mcp to initiate generation.",
};

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
  const showAppTab = !isDeploymentMode;
  const showLLMTabs = !isDeploymentMode || allowLLM;
  const showMoreAppTab = showAppTab;
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
  const moreMenuButtonClasses = `flex h-8 w-8 cursor-pointer items-center justify-center rounded-md focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-light-blue-500 ${
    vis &&
    (effectiveTabName === OverviewTabNameEnum.RunInstructions ||
      effectiveTabName === OverviewTabNameEnum.App ||
      effectiveTabName === OverviewTabNameEnum.Plugins)
      ? "text-blue-500"
      : "text-setta-400 hover:text-setta-600 dark:text-setta-600 dark:hover:text-setta-500"
  }`;
  const moreMenuItemClasses =
    "flex items-center gap-2 px-1.5 py-1.5 text-xs text-setta-700 dark:text-setta-200 mx-1 rounded-md text-left hover:bg-setta-600 hover:text-white dark:hover:bg-setta-900 dark:hover:text-white active:bg-blue-100 active:dark:bg-blue-950 cursor-pointer";

  return (
    <div
      id="OverviewPane"
      className="contents"
      ref={overviewRef}
      data-tab-scope="overview"
    >
      <div
        data-testid="overview-icon-rail"
        className={`fixed left-0 ${APP_CHROME_Z_INDEX_CLASS_NAME} flex w-10 flex-col items-center gap-1 border-r border-setta-200/75 bg-setta-50 py-2 dark:border-setta-850 dark:bg-setta-900`}
        style={{
          top: "calc(var(--setta-titlebar-height) + 36px)",
          bottom: hasViewModeTabs ? "36px" : "0px",
        }}
      >
        {showLLMTabs && (
          <TabButton<OverviewTabKey>
            tabName={OverviewTabNameEnum.ProjectAIChat}
            {...commonProps}
            data-testid="overview-tab-project-ai-chat"
            {...getFloatingBoxHandlers({ content: "ProjectAI Chat" })}
            icon={<IoChatbox size={20} />}
          />
        )}
        <TabButton<OverviewTabKey>
          tabName={OverviewTabNameEnum.Overview}
          {...commonProps}
          data-testid="overview-tab-overview"
          {...getFloatingBoxHandlers({ content: "Project Overview" })}
          icon={<i className="gg-list  !scale-100" />}
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
            data-testid="overview-tab-file-browser"
            {...getFloatingBoxHandlers({ content: "Explorer" })}
            icon={<TbFolder size={18} />}
          />
        )}
        {showGitTab && (
          <TabButton<OverviewTabKey>
            tabName={OverviewTabNameEnum.Git}
            {...commonProps}
            data-testid="overview-tab-git"
            {...getFloatingBoxHandlers({ content: "Git" })}
            icon={<IoMdGitBranch size={18} />}
          />
        )}
        <TabButton<OverviewTabKey>
          tabName={OverviewTabNameEnum.ViewModes}
          {...commonProps}
          data-testid="overview-tab-view-modes"
          {...getFloatingBoxHandlers({ content: "Viewing/Editing Mode" })}
          icon={<HiOutlineEye size={20} />}
        />
        <TabButton<OverviewTabKey>
          tabName={OverviewTabNameEnum.Notifications}
          {...commonProps}
          data-testid="overview-tab-notifications"
          {...getFloatingBoxHandlers({ content: "Notifications" })}
          icon={
            <div className="relative">
              <MdNotificationsNone size={20} />
              {hasUnreadHighSeverityBackendLogs && (
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500 dark:bg-red-400" />
              )}
            </div>
          }
        />
        <Menubar.Root className="w-8">
          <NavbarMenuDropdown
            triggerClassName={moreMenuButtonClasses}
            trigger={
              <span
                data-testid="overview-tab-more"
                aria-label="More"
                title={
                  vis && effectiveTabName === OverviewTabNameEnum.App
                    ? JSON_RENDER_OVERVIEW_QUICK_INFO.moreMenu
                    : "More"
                }
                {...getFloatingBoxHandlers({ content: "More" })}
              >
                <MdMoreHoriz size={20} />
              </span>
            }
            contentClassName={OVERVIEW_MORE_MENU_CONTENT_CLASS_NAME}
          >
            <MenuItem
              className={moreMenuItemClasses}
              onClick={() =>
                onOverviewTabClick(OverviewTabNameEnum.RunInstructions)
              }
            >
              <i className="w-3 opacity-80">
                <RiPlayList2Fill />
              </i>
              <span className="ml-0.5">Custom Runs</span>
            </MenuItem>
            {showMoreAppTab ? (
              <MenuItem
                className={moreMenuItemClasses}
                onClick={() => onOverviewTabClick(OverviewTabNameEnum.App)}
              >
                <i className="w-3 opacity-80">
                  <TbLayoutDashboard />
                </i>
                <span className="ml-0.5">JSON Render</span>
              </MenuItem>
            ) : null}
            <MenuItem
              className={moreMenuItemClasses}
              onClick={() => onOverviewTabClick(OverviewTabNameEnum.Plugins)}
            >
              <i className="w-3 opacity-80">
                <MdExtension />
              </i>
              <span className="ml-0.5">Plugins</span>
            </MenuItem>
          </NavbarMenuDropdown>
        </Menubar.Root>
        <Controls />
        <Link
          to={SETTINGS_ROUTER_PATH}
          state={{ pageLoadType: PAGE_LOAD_TYPES.LOAD_PROJECT_CONFIG }}
          data-testid="overview-left-rail-settings-link"
          className="focus-visible:ring-light-blue-500 mb-1 inline-flex h-8 w-8 cursor-pointer items-center justify-center text-setta-400 hover:text-setta-600 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 dark:text-setta-600 dark:hover:text-setta-500"
          aria-label="Open settings"
          {...getFloatingBoxHandlers({ content: "Settings" })}
        >
          <IoSettingsOutline size={18} />
        </Link>
      </div>
      <PaneContainer
        paneName={PaneNameEnum.overview}
        right={false}
        onResizeStop={onOverviewResizeStop}
        vis={vis}
        width={width}
        minimumWidth={getPaneMinimumWidth(PaneNameEnum.overview)}
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
  const titleQuickInfo =
    selectedTabName === OverviewTabNameEnum.App
      ? JSON_RENDER_OVERVIEW_QUICK_INFO.title
      : undefined;
  return (
    <div
      data-testid="overview-tab-content-shell"
      className={
        isFullWidth
          ? "flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden"
          : "mx-auto flex h-full min-h-0 w-[calc(100%_-_1.5rem)] min-w-0 flex-1 flex-col overflow-hidden px-1.5"
      }
    >
      {isFullWidth ? (
        <div className={FILE_BROWSER_META_INSET_CLASS}>
          <h2
            className="mb-1 cursor-pointer select-none text-xs font-bold uppercase tracking-tight text-setta-300 dark:text-setta-500"
            title={titleQuickInfo}
          >
            {title}
          </h2>
        </div>
      ) : (
        <h2
          className="mb-1 cursor-pointer select-none text-xs font-bold uppercase tracking-tight text-setta-300 dark:text-setta-500"
          title={titleQuickInfo}
        >
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
        <FileBrowserWorkspace
          metaPaddingClassName={FILE_BROWSER_META_INSET_CLASS}
          listInsetLeft={FILE_BROWSER_LIST_INSET_LEFT}
        />
      );
    case OverviewTabNameEnum.Git:
      return <GitPane />;
    case OverviewTabNameEnum.App:
      return <AppConfigPane />;
    case OverviewTabNameEnum.RunInstructions:
      return <RunInstructions />;
    case OverviewTabNameEnum.ViewModes:
      return <ViewingEditingMode />;
    case OverviewTabNameEnum.Notifications:
      return <NotificationsArea />;
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
