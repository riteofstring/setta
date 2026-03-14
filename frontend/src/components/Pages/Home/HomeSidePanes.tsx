import { PaneContainer } from "components/Utils/PaneContainer";
import { IoSettingsOutline } from "react-icons/io5";
import { TbFolder, TbListDetails } from "react-icons/tb";
import { Link } from "react-router-dom";
import { useLocalStorage } from "state/definitions";
import {
  PAGE_LOAD_TYPES,
  PaneNameEnum,
  SETTINGS_ROUTER_PATH,
} from "utils/constants";
import { type ProjectConfig } from "utils/generatedTypes";
import { HomeSelectedProjectDetails } from "./HomeSelectedProjectDetails";
import { HomeWorkspaceBrowserPane } from "./HomeWorkspaceBrowserPane";

const HOME_WORKSPACE_PANE_NAME = PaneNameEnum.homeWorkspace;
const HOME_SELECTED_PROJECT_PANE_NAME = PaneNameEnum.homeSelectedProject;
const HOME_MIN_PANE_WIDTH = 260;
const HOME_ICON_RAIL_Z_INDEX_CLASS = "z-[31]";
const HOME_PANE_TITLE_CLASS =
  "mb-1 cursor-pointer select-none text-xs font-bold uppercase tracking-tight text-setta-300 dark:text-setta-500";
const HOME_INSET_PANE_CONTENT_CLASS =
  "flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden px-2";

export function HomeSidePanes({
  showSidePanes,
  homeWorkspacePaneVis,
  homeWorkspacePaneWidth,
  homeSelectedProjectPaneVis,
  homeSelectedProjectPaneWidth,
  isDeploymentMode,
  selectedDetailProject,
  defaultProjectConfigId,
}: {
  showSidePanes: boolean;
  homeWorkspacePaneVis: boolean;
  homeWorkspacePaneWidth: number;
  homeSelectedProjectPaneVis: boolean;
  homeSelectedProjectPaneWidth: number;
  isDeploymentMode: boolean;
  selectedDetailProject: ProjectConfig | null;
  defaultProjectConfigId: string | null;
}) {
  if (!showSidePanes) {
    return null;
  }

  return (
    <>
      <HomeLeftIconRail
        workspacePaneVisible={homeWorkspacePaneVis}
        isDeploymentMode={isDeploymentMode}
      />
      <HomeRightIconRail
        selectedProjectPaneVisible={homeSelectedProjectPaneVis}
      />
      <PaneContainer
        paneName={HOME_WORKSPACE_PANE_NAME}
        right={false}
        minimumWidth={HOME_MIN_PANE_WIDTH}
        vis={homeWorkspacePaneVis}
        width={homeWorkspacePaneWidth}
        paddingClassName="pt-2.5 pb-0"
      >
        {homeWorkspacePaneVis && <HomeWorkspaceBrowserPane />}
      </PaneContainer>
      <PaneContainer
        paneName={HOME_SELECTED_PROJECT_PANE_NAME}
        right={true}
        minimumWidth={HOME_MIN_PANE_WIDTH}
        vis={homeSelectedProjectPaneVis}
        width={homeSelectedProjectPaneWidth}
      >
        {homeSelectedProjectPaneVis && (
          <section className={HOME_INSET_PANE_CONTENT_CLASS}>
            <h2 className={HOME_PANE_TITLE_CLASS}>Selected Project</h2>
            <HomeSelectedProjectDetails
              project={selectedDetailProject}
              isDefault={selectedDetailProject?.id === defaultProjectConfigId}
              isDeploymentMode={isDeploymentMode}
              hideTitle
            />
          </section>
        )}
      </PaneContainer>
    </>
  );
}

function getHomeRailButtonColor(isActive: boolean): string {
  if (isActive) {
    return "text-blue-500";
  }
  return "text-setta-400 hover:text-setta-600 dark:text-setta-600 dark:hover:text-setta-500";
}

function toggleHomeWorkspacePaneVisibility() {
  const { homeWorkspacePaneVis } = useLocalStorage.getState();
  useLocalStorage.setState({
    homeWorkspacePaneVis: !homeWorkspacePaneVis,
  });
}

function toggleHomeSelectedProjectPaneVisibility() {
  const { homeSelectedProjectPaneVis } = useLocalStorage.getState();
  useLocalStorage.setState({
    homeSelectedProjectPaneVis: !homeSelectedProjectPaneVis,
  });
}

function HomeLeftIconRail({
  workspacePaneVisible,
  isDeploymentMode,
}: {
  workspacePaneVisible: boolean;
  isDeploymentMode: boolean;
}) {
  return (
    <div
      data-testid="home-left-icon-rail"
      className={`fixed left-0 ${HOME_ICON_RAIL_Z_INDEX_CLASS} flex w-10 flex-col items-center gap-1 border-r border-setta-200/75 bg-setta-50 py-2 dark:border-setta-850 dark:bg-setta-900`}
      style={{
        top: "calc(var(--setta-titlebar-height) + 36px)",
        bottom: "0px",
      }}
    >
      <button
        type="button"
        data-testid="home-left-rail-workspace-toggle"
        className={`focus-visible:ring-light-blue-500 flex h-8 w-8 cursor-pointer items-center justify-center focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 ${getHomeRailButtonColor(
          workspacePaneVisible,
        )}`}
        onClick={toggleHomeWorkspacePaneVisibility}
        aria-label="Toggle workspace browser pane"
      >
        <TbFolder size={18} />
      </button>
      {!isDeploymentMode && (
        <Link
          to={SETTINGS_ROUTER_PATH}
          state={{ pageLoadType: PAGE_LOAD_TYPES.LOAD_PROJECT_CONFIG }}
          data-testid="home-left-rail-settings-link"
          className={`focus-visible:ring-light-blue-500 mb-1 mt-auto inline-flex h-8 w-8 cursor-pointer items-center justify-center focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 ${getHomeRailButtonColor(
            false,
          )}`}
          aria-label="Open settings"
        >
          <IoSettingsOutline size={18} />
        </Link>
      )}
    </div>
  );
}

function HomeRightIconRail({
  selectedProjectPaneVisible,
}: {
  selectedProjectPaneVisible: boolean;
}) {
  return (
    <div
      data-testid="home-right-icon-rail"
      className={`fixed right-0 ${HOME_ICON_RAIL_Z_INDEX_CLASS} flex w-10 flex-col items-center gap-1 border-l border-setta-200/75 bg-setta-50 py-2 dark:border-setta-850 dark:bg-setta-900`}
      style={{
        top: "calc(var(--setta-titlebar-height) + 36px)",
        bottom: "0px",
      }}
    >
      <button
        type="button"
        data-testid="home-right-rail-selected-project-toggle"
        className={`focus-visible:ring-light-blue-500 flex h-8 w-8 cursor-pointer items-center justify-center focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 ${getHomeRailButtonColor(
          selectedProjectPaneVisible,
        )}`}
        onClick={toggleHomeSelectedProjectPaneVisibility}
        aria-label="Toggle selected project pane"
      >
        <TbListDetails size={18} />
      </button>
    </div>
  );
}
