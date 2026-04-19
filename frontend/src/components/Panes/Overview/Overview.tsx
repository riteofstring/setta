import * as Menubar from "@radix-ui/react-menubar";
import { NavbarMenuDropdown } from "components/Utils/atoms/menubar/menudropdown";
import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import { PaneContainer } from "components/Utils/PaneContainer";
import Controls from "forks/xyflow/controls/Controls";
import { useAppSubsystemOverviewTab } from "plugins/appSubsystem";
import { createRuntimeAppSubsystemFrontendHost } from "plugins/appSubsystemFrontendHost";
import {
  AppSubsystemRendererHost,
  EMPTY_APP_SUBSYSTEM_RENDERER_PROPS,
} from "plugins/appSubsystemRendererHost";
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
import { resetProjectStores } from "state/utils";
import {
  APP_CHROME_Z_INDEX_CLASS_NAME,
  APP_MENU_Z_INDEX_CLASS_NAME,
  OverviewTabKey,
  OverviewTabNameEnum,
  OverviewTabNamePrettified,
  PAGE_LOAD_TYPES,
  PaneNameEnum,
  parsePluginPaneOverviewTabName,
  SETTINGS_ROUTER_PATH,
} from "utils/constants";
import { useTabScope } from "utils/focusManager";
import { type OverviewTabName } from "utils/generatedTypes";
import {
  onOverviewResizeStop,
  onOverviewTabClick,
  TabButton,
} from "../paneFns";
import { getPaneMinimumWidth } from "../paneLayout";
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
const OVERVIEW_MORE_MENU_CONTENT_CLASS_NAME = `${APP_MENU_Z_INDEX_CLASS_NAME} min-w-[180px] rounded-md border border-solid border-setta-100 bg-white p-1 shadow-xl transition-all will-change-[transform,opacity] dark:border-setta-700/50 dark:bg-setta-850`;
const PROJECT_AI_OVERVIEW_TABS = new Set<OverviewTabName>([
  OverviewTabNameEnum.ProjectAIChat,
  OverviewTabNameEnum.ProjectAISettings,
]);
const OVERVIEW_MORE_MENU_ACTIVE_TABS = new Set<OverviewTabName>([
  OverviewTabNameEnum.RunInstructions,
  OverviewTabNameEnum.App,
  OverviewTabNameEnum.Plugins,
]);
const PLUGIN_PANE_TAB_ICONS = {
  folder: <TbFolder size={14} className="setta-plugin-pane-icon--folder" />,
  git: <RiGitCommitLine size={14} className="setta-plugin-pane-icon--git" />,
  radar: <RiRadarLine size={14} className="setta-plugin-pane-icon--radar" />,
  dashboard: (
    <TbLayoutDashboard
      size={14}
      className="setta-plugin-pane-icon--dashboard"
    />
  ),
  eye: <HiOutlineEye size={14} className="setta-plugin-pane-icon--eye" />,
  notifications: (
    <MdNotificationsNone
      size={14}
      className="setta-plugin-pane-icon--notifications"
    />
  ),
  bug: <MdBugReport size={14} className="setta-plugin-pane-icon--bug" />,
  chat: <IoChatbox size={14} className="setta-plugin-pane-icon--chat" />,
  robot: (
    <MdOutlineSmartToy size={14} className="setta-plugin-pane-icon--robot" />
  ),
  extension: (
    <MdExtension size={14} className="setta-plugin-pane-icon--extension" />
  ),
} as const satisfies Record<PluginPaneIconName, ReactElement>;
const OVERVIEW_TAB_CONTENT = {
  [OverviewTabNameEnum.Overview]: () => <ProjectOverview />,
  [OverviewTabNameEnum.Plugins]: () => <PluginsPane />,
  [OverviewTabNameEnum.FileBrowser]: () => (
    <FileBrowserWorkspace
      metaPaddingClassName={FILE_BROWSER_META_INSET_CLASS}
      listInsetLeft={FILE_BROWSER_LIST_INSET_LEFT}
    />
  ),
  [OverviewTabNameEnum.Git]: () => <GitPane />,
  [OverviewTabNameEnum.RunInstructions]: () => <RunInstructions />,
  [OverviewTabNameEnum.ViewModes]: () => <ViewingEditingMode />,
  [OverviewTabNameEnum.Notifications]: () => <NotificationsArea />,
  [OverviewTabNameEnum.ProjectAIChat]: () => <ProjectChat />,
  [OverviewTabNameEnum.ProjectAISettings]: () => <ProjectAISettings />,
} as const satisfies Record<
  Exclude<OverviewTabName, typeof OverviewTabNameEnum.App>,
  () => ReactElement
>;

type OverviewAvailability = {
  showFileBrowserTab: boolean;
  showGitTab: boolean;
  showAppTab: boolean;
  showLLMTabs: boolean;
  showMoreAppTab: boolean;
};

type OverviewRailTab = {
  key: string;
  tabName: OverviewTabKey;
  floatingContent: string;
  icon: ReactElement;
  dataTestId?: string;
  id?: string;
};

type OverviewMoreMenuItem = {
  key: string;
  tabName: OverviewTabName;
  label: string;
  icon: ReactElement;
};

type OverviewTabButtonCommonProps = {
  vis: boolean;
  selectedTabName: OverviewTabKey;
  onTabClick: typeof onOverviewTabClick;
  className: string;
  requiredTabs: null;
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
  const appOverviewTab = useAppSubsystemOverviewTab();
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
  const availability = getOverviewAvailability(
    isDeploymentMode,
    allowLLM,
    appOverviewTab !== null,
  );
  const selectedPluginPaneTab = pluginPaneTabByKey[selectedTabName] ?? null;
  const effectiveTabName = resolveEffectiveOverviewTabName(
    selectedTabName,
    selectedPluginPaneTab,
    availability,
  );
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
      <OverviewRail
        commonProps={commonProps}
        pluginPaneTabs={pluginPaneTabs}
        appOverviewTab={appOverviewTab}
        availability={availability}
        vis={vis}
        effectiveTabName={effectiveTabName}
        hasUnreadHighSeverityBackendLogs={hasUnreadHighSeverityBackendLogs}
        hasViewModeTabs={hasViewModeTabs}
      />
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
            appOverviewTab={appOverviewTab}
          />
        )}
      </PaneContainer>
    </div>
  );
}

function getOverviewAvailability(
  isDeploymentMode: boolean,
  allowLLM: boolean,
  hasAppOverviewTab: boolean,
): OverviewAvailability {
  const showAuthoringTabs = !isDeploymentMode;
  return {
    showFileBrowserTab: showAuthoringTabs,
    showGitTab: showAuthoringTabs,
    showAppTab: showAuthoringTabs && hasAppOverviewTab,
    showLLMTabs: showAuthoringTabs || allowLLM,
    showMoreAppTab: showAuthoringTabs && hasAppOverviewTab,
  };
}

function isOverviewTabVisible(
  tabName: OverviewTabName,
  availability: OverviewAvailability,
): boolean {
  if (PROJECT_AI_OVERVIEW_TABS.has(tabName)) {
    return availability.showLLMTabs;
  }
  if (tabName === OverviewTabNameEnum.FileBrowser) {
    return availability.showFileBrowserTab;
  }
  if (tabName === OverviewTabNameEnum.Git) {
    return availability.showGitTab;
  }
  if (tabName === OverviewTabNameEnum.App) {
    return availability.showAppTab;
  }
  return true;
}

function getOverviewBaseTabName(
  selectedTabName: OverviewTabKey,
): OverviewTabName {
  return selectedTabName in OverviewTabNamePrettified
    ? (selectedTabName as OverviewTabName)
    : OverviewTabNameEnum.Overview;
}

function resolveEffectiveOverviewTabName(
  selectedTabName: OverviewTabKey,
  selectedPluginPaneTab: PluginPaneTabEntry | null,
  availability: OverviewAvailability,
): OverviewTabKey {
  if (
    parsePluginPaneOverviewTabName(selectedTabName) !== null &&
    !selectedPluginPaneTab
  ) {
    return OverviewTabNameEnum.Plugins;
  }
  const selectedBaseTabName = getOverviewBaseTabName(selectedTabName);
  return isOverviewTabVisible(selectedBaseTabName, availability)
    ? selectedTabName
    : OverviewTabNameEnum.Overview;
}

function renderPluginPaneTabIcon(
  iconName: PluginPaneIconName | undefined,
): ReactElement {
  return PLUGIN_PANE_TAB_ICONS[iconName ?? "extension"];
}

function buildOverviewRailTabs(
  pluginPaneTabs: PluginPaneTabEntry[],
  availability: OverviewAvailability,
  hasUnreadHighSeverityBackendLogs: boolean,
): OverviewRailTab[] {
  const tabs: OverviewRailTab[] = [];
  if (availability.showLLMTabs) {
    tabs.push({
      key: OverviewTabNameEnum.ProjectAIChat,
      tabName: OverviewTabNameEnum.ProjectAIChat,
      dataTestId: "overview-tab-project-ai-chat",
      floatingContent: "ProjectAI Chat",
      icon: <IoChatbox size={20} />,
    });
  }
  tabs.push({
    key: OverviewTabNameEnum.Overview,
    tabName: OverviewTabNameEnum.Overview,
    dataTestId: "overview-tab-overview",
    floatingContent: "Project Overview",
    icon: <i className="gg-list !scale-100" />,
  });
  tabs.push(
    ...pluginPaneTabs.map((pluginPaneTab) => ({
      key: pluginPaneTab.tabKey,
      tabName: pluginPaneTab.tabKey,
      id: `overview-plugin-pane-tab-${encodeURIComponent(pluginPaneTab.pluginId)}-${encodeURIComponent(pluginPaneTab.paneId)}`,
      floatingContent: `${pluginPaneTab.title} (${pluginPaneTab.pluginId})`,
      icon: renderPluginPaneTabIcon(pluginPaneTab.icon),
    })),
  );
  if (availability.showFileBrowserTab) {
    tabs.push({
      key: OverviewTabNameEnum.FileBrowser,
      tabName: OverviewTabNameEnum.FileBrowser,
      dataTestId: "overview-tab-file-browser",
      floatingContent: "Explorer",
      icon: <TbFolder size={18} />,
    });
  }
  if (availability.showGitTab) {
    tabs.push({
      key: OverviewTabNameEnum.Git,
      tabName: OverviewTabNameEnum.Git,
      dataTestId: "overview-tab-git",
      floatingContent: "Git",
      icon: <IoMdGitBranch size={18} />,
    });
  }
  tabs.push(
    {
      key: OverviewTabNameEnum.ViewModes,
      tabName: OverviewTabNameEnum.ViewModes,
      dataTestId: "overview-tab-view-modes",
      floatingContent: "Viewing/Editing Mode",
      icon: <HiOutlineEye size={20} />,
    },
    {
      key: OverviewTabNameEnum.Notifications,
      tabName: OverviewTabNameEnum.Notifications,
      dataTestId: "overview-tab-notifications",
      floatingContent: "Notifications",
      icon: (
        <div className="relative">
          <MdNotificationsNone size={20} />
          {hasUnreadHighSeverityBackendLogs ? (
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500 dark:bg-red-400" />
          ) : null}
        </div>
      ),
    },
  );
  return tabs;
}

function buildOverviewMoreMenuItems(
  showMoreAppTab: boolean,
  appOverviewTab: ReturnType<typeof useAppSubsystemOverviewTab> | null,
): OverviewMoreMenuItem[] {
  const items: OverviewMoreMenuItem[] = [
    {
      key: OverviewTabNameEnum.RunInstructions,
      tabName: OverviewTabNameEnum.RunInstructions,
      label: "Custom Runs",
      icon: (
        <i className="w-3 opacity-80">
          <RiPlayList2Fill />
        </i>
      ),
    },
  ];
  if (showMoreAppTab && appOverviewTab) {
    items.push({
      key: OverviewTabNameEnum.App,
      tabName: OverviewTabNameEnum.App,
      label: appOverviewTab.moreMenuLabel,
      icon: (
        <i className="w-3 opacity-80">
          <TbLayoutDashboard />
        </i>
      ),
    });
  }
  items.push({
    key: OverviewTabNameEnum.Plugins,
    tabName: OverviewTabNameEnum.Plugins,
    label: "Plugins",
    icon: (
      <i className="w-3 opacity-80">
        <MdExtension />
      </i>
    ),
  });
  return items;
}

function getMoreMenuButtonClasses(
  vis: boolean,
  effectiveTabName: OverviewTabKey,
): string {
  return `flex h-8 w-8 cursor-pointer items-center justify-center rounded-md focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-light-blue-500 ${
    vis &&
    OVERVIEW_MORE_MENU_ACTIVE_TABS.has(getOverviewBaseTabName(effectiveTabName))
      ? "text-blue-500"
      : "text-setta-400 hover:text-setta-600 dark:text-setta-600 dark:hover:text-setta-500"
  }`;
}

function OverviewRail({
  commonProps,
  pluginPaneTabs,
  appOverviewTab,
  availability,
  vis,
  effectiveTabName,
  hasUnreadHighSeverityBackendLogs,
  hasViewModeTabs,
}: {
  commonProps: OverviewTabButtonCommonProps;
  pluginPaneTabs: PluginPaneTabEntry[];
  appOverviewTab: ReturnType<typeof useAppSubsystemOverviewTab> | null;
  availability: OverviewAvailability;
  vis: boolean;
  effectiveTabName: OverviewTabKey;
  hasUnreadHighSeverityBackendLogs: boolean;
  hasViewModeTabs: boolean;
}) {
  const railTabs = buildOverviewRailTabs(
    pluginPaneTabs,
    availability,
    hasUnreadHighSeverityBackendLogs,
  );
  const moreMenuItems = buildOverviewMoreMenuItems(
    availability.showMoreAppTab,
    appOverviewTab,
  );
  const moreMenuItemClasses =
    "mx-1 flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-xs text-setta-700 hover:bg-setta-600 hover:text-white active:bg-blue-100 dark:text-setta-200 dark:hover:bg-setta-900 dark:hover:text-white active:dark:bg-blue-950";
  const isAppMoreMenuTitle =
    vis &&
    effectiveTabName === OverviewTabNameEnum.App &&
    appOverviewTab !== null;

  return (
    <div
      data-testid="overview-icon-rail"
      className={`fixed left-0 ${APP_CHROME_Z_INDEX_CLASS_NAME} flex w-10 flex-col items-center gap-1 border-r border-setta-200/75 bg-setta-50 py-2 dark:border-setta-850 dark:bg-setta-900`}
      style={{
        top: "calc(var(--setta-titlebar-height) + 36px)",
        bottom: hasViewModeTabs ? "36px" : "0px",
      }}
    >
      {railTabs.map((tab) => (
        <TabButton<OverviewTabKey>
          key={tab.key}
          tabName={tab.tabName}
          id={tab.id}
          data-testid={tab.dataTestId}
          {...commonProps}
          {...getFloatingBoxHandlers({ content: tab.floatingContent })}
          icon={tab.icon}
        />
      ))}
      <Menubar.Root className="w-8">
        <NavbarMenuDropdown
          triggerClassName={getMoreMenuButtonClasses(vis, effectiveTabName)}
          trigger={
            <span
              data-testid="overview-tab-more"
              aria-label="More"
              title={
                isAppMoreMenuTitle ? appOverviewTab?.moreMenuQuickInfo : "More"
              }
              {...getFloatingBoxHandlers({ content: "More" })}
            >
              <MdMoreHoriz size={20} />
            </span>
          }
          contentClassName={OVERVIEW_MORE_MENU_CONTENT_CLASS_NAME}
        >
          {moreMenuItems.map((item) => (
            <MenuItem
              key={item.key}
              className={moreMenuItemClasses}
              onClick={() => onOverviewTabClick(item.tabName)}
            >
              {item.icon}
              <span className="ml-0.5">{item.label}</span>
            </MenuItem>
          ))}
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
  );
}

function TabsVisible({
  selectedTabName,
  selectedPluginPaneTab,
  appOverviewTab,
}: {
  selectedTabName: OverviewTabKey;
  selectedPluginPaneTab: PluginPaneTabEntry | null;
  appOverviewTab: ReturnType<typeof useAppSubsystemOverviewTab> | null;
}) {
  const title = selectedPluginPaneTab
    ? selectedPluginPaneTab.title
    : resolveOverviewTitle(selectedTabName);
  const isFullWidth = selectedTabName === OverviewTabNameEnum.FileBrowser;
  const titleQuickInfo =
    selectedTabName === OverviewTabNameEnum.App && appOverviewTab
      ? appOverviewTab.titleQuickInfo
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
        appOverviewTab={appOverviewTab}
      />
    </div>
  );
}

function TabContent({
  selectedTabName,
  selectedPluginPaneTab,
  appOverviewTab,
}: {
  selectedTabName: OverviewTabKey;
  selectedPluginPaneTab: PluginPaneTabEntry | null;
  appOverviewTab: ReturnType<typeof useAppSubsystemOverviewTab> | null;
}) {
  const appSubsystemHost = useMemo(
    () =>
      createRuntimeAppSubsystemFrontendHost({
        resetProjectRuntimeState: resetProjectStores,
      }),
    [],
  );
  if (selectedPluginPaneTab) {
    return (
      <PluginOverviewPane
        pluginId={selectedPluginPaneTab.pluginId}
        paneId={selectedPluginPaneTab.paneId}
      />
    );
  }
  if (selectedTabName === OverviewTabNameEnum.App && appOverviewTab) {
    return (
      <AppSubsystemRendererHost
        renderer={appOverviewTab.renderer}
        props={EMPTY_APP_SUBSYSTEM_RENDERER_PROPS}
        host={appSubsystemHost}
        className="h-full min-h-0 w-full"
        testId="app-subsystem-overview-tab"
      />
    );
  }
  return OVERVIEW_TAB_CONTENT[
    getOverviewBaseTabName(selectedTabName) as keyof typeof OVERVIEW_TAB_CONTENT
  ]();
}

function resolveOverviewTitle(selectedTabName: OverviewTabKey): string {
  return OverviewTabNamePrettified[getOverviewBaseTabName(selectedTabName)];
}
