import { FileBrowserPane } from "components/Panes/Overview/FileBrowser/FileBrowserPane";
import { togglePaneVisibility } from "components/Panes/paneLayout";
import { InlineCodeMirrorInput } from "components/Utils/CodeMirror/InlineCodeMirrorInput";
import { createDynamicFolderPathCompletionSource } from "components/Utils/CodeMirror/folderPathCompletions";
import { PaneContainer } from "components/Utils/PaneContainer";
import { withRightPaneTitleClearance } from "components/Utils/paneTitleSpacing";
import _ from "lodash";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IoSettingsOutline } from "react-icons/io5";
import { TbFolder, TbListDetails } from "react-icons/tb";
import { Link } from "react-router-dom";
import { useHomeFileBrowserState } from "state/stores/fileBrowserStores";
import {
  APP_CHROME_Z_INDEX_CLASS_NAME,
  CLOSED_PANE_WIDTH,
  CODEMIRROR_TOOLTIP_PARENT_ID,
  PAGE_LOAD_TYPES,
  PaneNameEnum,
  SETTINGS_ROUTER_PATH,
} from "utils/constants";
import type { ProjectConfig } from "utils/generatedTypes";

import { HomeSelectedProjectDetails } from "./homeSelectedProjectDetails";

const HOME_WORKSPACE_PANE_NAME = PaneNameEnum.homeWorkspace;
const HOME_SELECTED_PROJECT_PANE_NAME = PaneNameEnum.homeSelectedProject;
const HOME_MIN_PANE_WIDTH = 260;
const HOME_FILE_BROWSER_META_INSET_CLASS =
  "mx-auto w-[calc(100%_-_1.5rem)] px-1.5";
const HOME_FILE_BROWSER_TITLE_INSET_CLASS =
  "mx-auto w-[calc(100%_-_1.5rem)] px-1.5";
const HOME_FILE_BROWSER_LIST_INSET_LEFT = 10;
const HOME_PANE_TITLE_CLASS =
  "mb-1 cursor-pointer select-none text-xs font-bold uppercase tracking-tight text-setta-300 dark:text-setta-500";
const HOME_FILE_BROWSER_PANE_CONTENT_CLASS =
  "flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden";
const HOME_INSET_PANE_CONTENT_CLASS =
  "flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden px-2";

export const HOME_SIDE_RAIL_CLASS_NAME = `${APP_CHROME_Z_INDEX_CLASS_NAME} fixed flex w-10 flex-col items-center gap-1 bg-setta-50 py-2 dark:bg-setta-900`;
export const HOME_RIGHT_PANE_TITLE_CLASS_NAME = withRightPaneTitleClearance(
  HOME_PANE_TITLE_CLASS,
);

type HomeLeftIconRailProps = {
  workspacePaneVisible: boolean;
  isDeploymentMode: boolean;
};

type HomeRightIconRailProps = {
  selectedProjectPaneVisible: boolean;
};

type HomeFileBrowserPaneProps = {
  visible: boolean;
  width: number;
};

type HomeSelectedProjectPaneProps = {
  visible: boolean;
  width: number;
  project: ProjectConfig | null;
  defaultProjectConfigId: string | null;
  isDeploymentMode: boolean;
};

function getHomeRailButtonColor(isActive: boolean): string {
  if (isActive) {
    return "text-blue-500";
  }
  return "text-setta-400 hover:text-setta-600 dark:text-setta-600 dark:hover:text-setta-500";
}

function toggleHomeWorkspacePaneVisibility() {
  togglePaneVisibility(HOME_WORKSPACE_PANE_NAME);
}

function toggleHomeSelectedProjectPaneVisibility() {
  togglePaneVisibility(HOME_SELECTED_PROJECT_PANE_NAME);
}

export function resolveHomeMiddleInsetPx({
  showSidePanes,
  paneVisible,
  paneWidth,
}: {
  showSidePanes: boolean;
  paneVisible: boolean;
  paneWidth: number;
}): number {
  if (!showSidePanes) {
    return 0;
  }
  if (paneVisible) {
    return paneWidth;
  }
  return CLOSED_PANE_WIDTH;
}

export function shouldApplyHomeFileBrowserPath({
  nextPath,
  currentRootPath,
}: {
  nextPath: string;
  currentRootPath: string | null;
}): boolean {
  if (!nextPath) {
    return false;
  }
  return nextPath !== currentRootPath;
}

export function HomeLeftIconRail({
  workspacePaneVisible,
  isDeploymentMode,
}: HomeLeftIconRailProps) {
  return (
    <div
      data-testid="home-left-icon-rail"
      className={`${HOME_SIDE_RAIL_CLASS_NAME} left-0 border-r border-setta-200/75 dark:border-setta-850`}
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

export function HomeRightIconRail({
  selectedProjectPaneVisible,
}: HomeRightIconRailProps) {
  return (
    <div
      data-testid="home-right-icon-rail"
      className={`${HOME_SIDE_RAIL_CLASS_NAME} right-0 border-l border-setta-200/75 dark:border-setta-850`}
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

export function HomeFileBrowserPane({
  visible,
  width,
}: HomeFileBrowserPaneProps) {
  return (
    <PaneContainer
      paneName={HOME_WORKSPACE_PANE_NAME}
      right={false}
      minimumWidth={HOME_MIN_PANE_WIDTH}
      vis={visible}
      width={width}
      paddingClassName="pt-2.5 pb-0"
    >
      {visible && (
        <section
          className={HOME_FILE_BROWSER_PANE_CONTENT_CLASS}
          data-testid="home-file-browser-column"
        >
          <div className={HOME_FILE_BROWSER_TITLE_INSET_CLASS}>
            <h2 className={HOME_PANE_TITLE_CLASS}>Workspace Browser</h2>
          </div>
          <HomeFileBrowserColumn />
        </section>
      )}
    </PaneContainer>
  );
}

export function HomeSelectedProjectPane({
  visible,
  width,
  project,
  defaultProjectConfigId,
  isDeploymentMode,
}: HomeSelectedProjectPaneProps) {
  return (
    <PaneContainer
      paneName={HOME_SELECTED_PROJECT_PANE_NAME}
      right={true}
      minimumWidth={HOME_MIN_PANE_WIDTH}
      vis={visible}
      width={width}
    >
      {visible && (
        <section className={HOME_INSET_PANE_CONTENT_CLASS}>
          <h2 className={HOME_RIGHT_PANE_TITLE_CLASS_NAME}>Selected Project</h2>
          <HomeSelectedProjectDetails
            project={project}
            isDefault={project?.id === defaultProjectConfigId}
            isDeploymentMode={isDeploymentMode}
            hideTitle
          />
        </section>
      )}
    </PaneContainer>
  );
}

function HomeFileBrowserColumn() {
  const { rootPath, pathSeparator, ignorePatterns } = useHomeFileBrowserState(
    (state) => ({
      rootPath: state.rootPath,
      pathSeparator: state.pathSeparator,
      ignorePatterns: state.ignorePatterns,
    }),
    _.isEqual,
  );
  const [pathInput, setPathInput] = useState("");
  const completionOptionsRef = useRef<{
    rootPath: string | null;
    pathSeparator?: string;
    ignorePatterns?: string[] | null;
    allowOutsideWorkspaceRoot?: boolean;
  }>({ rootPath: null });
  completionOptionsRef.current.rootPath = rootPath;
  completionOptionsRef.current.pathSeparator = pathSeparator;
  completionOptionsRef.current.ignorePatterns = ignorePatterns;
  completionOptionsRef.current.allowOutsideWorkspaceRoot = true;
  const completionSource = useMemo(
    () =>
      createDynamicFolderPathCompletionSource(
        () => completionOptionsRef.current,
      ),
    [],
  );
  const blurTriggeredByEscapeKey = useRef(false);
  const blurActiveElement = useCallback(() => {
    if (typeof document === "undefined") {
      return;
    }
    const active = document.activeElement;
    if (active instanceof HTMLElement) {
      active.blur();
    }
  }, []);
  const pathKeyComboActions = useMemo(
    () => ({
      Escape: () => {
        blurTriggeredByEscapeKey.current = true;
        setPathInput(rootPath ?? "");
        blurActiveElement();
        return true;
      },
    }),
    [blurActiveElement, rootPath],
  );
  const browserPathDummyInputClassName =
    "flex-1 min-w-0 cursor-text truncate bg-transparent pl-6 py-1 text-xs leading-4 outline-0 placeholder-setta-300 dark:placeholder-setta-700 font-sans";
  const browserPathInputClassName =
    "setta-cm-browser-path-input flex-1 min-w-0 h-full cursor-text truncate bg-transparent outline-0 [&_.cm-content]:!py-1 [&_.cm-content]:!pl-6 [&_.cm-content]:!pr-0 [&_.cm-line]:!px-0 [&_.cm-content]:text-xs [&_.cm-content]:!leading-4 [&_.cm-content]:text-setta-700 dark:[&_.cm-content]:text-setta-200 [&_.cm-placeholder]:text-setta-300 dark:[&_.cm-placeholder]:text-setta-700 [&_.cm-content]:font-sans";

  useEffect(() => {
    if (!rootPath) {
      return;
    }
    setPathInput(rootPath);
  }, [rootPath]);

  function applyPath(nextPathValue?: string) {
    const nextPath = (nextPathValue ?? pathInput).trim();
    if (
      !shouldApplyHomeFileBrowserPath({
        nextPath,
        currentRootPath: useHomeFileBrowserState.getState().rootPath,
      })
    ) {
      return;
    }
    useHomeFileBrowserState.setState({
      rootPath: nextPath,
      selectedPath: nextPath,
      expandedPaths: { [nextPath]: true },
    });
  }

  return (
    <section className="flex h-full min-h-0 w-full min-w-0 flex-col pb-2 [&_[data-testid='setta-initialized-folder-icon']]:text-blue-500 dark:[&_[data-testid='setta-initialized-folder-icon']]:text-blue-400">
      <div
        className={`flex flex-col gap-2 ${HOME_FILE_BROWSER_META_INSET_CLASS}`}
      >
        <div className="flex items-center gap-2">
          <div
            role="search"
            data-testid="home-file-browser-path-input"
            className="nodrag group/folderpath relative mx-[2px] flex h-7 min-w-0 flex-1 overflow-hidden border-solid border-transparent bg-transparent [border-width:0_0_1px_0] focus-within:border-blue-300 dark:text-setta-200"
          >
            <TbFolder
              className="pointer-events-none absolute left-1 top-1/2 -translate-y-1/2 text-setta-400 dark:text-setta-600"
              size={14}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 overflow-hidden opacity-100 transition-opacity duration-0 group-focus-within/folderpath:opacity-0 group-focus-within/folderpath:duration-150"
            >
              <span className="block min-w-0 truncate py-1 pl-6 font-sans text-xs leading-4 text-setta-700 dark:text-setta-200">
                {pathInput}
              </span>
            </div>
            <InlineCodeMirrorInput
              id="CodeMirror-home-browser-path"
              value={pathInput}
              onChange={setPathInput}
              onBlur={(value) => {
                if (blurTriggeredByEscapeKey.current) {
                  blurTriggeredByEscapeKey.current = false;
                  return;
                }
                applyPath(value);
              }}
              onEnter={(_, completionResult) => {
                if (completionResult) {
                  return;
                }
                blurActiveElement();
              }}
              className={browserPathInputClassName}
              dummyClassName={browserPathDummyInputClassName}
              singleLine
              completionsFn={completionSource ?? undefined}
              completionInteractionDelayMs={0}
              completionTriggerChars={["/", "\\"]}
              keyComboActions={pathKeyComboActions}
              tooltipParentDivId={CODEMIRROR_TOOLTIP_PARENT_ID}
            />
          </div>
          <button
            type="button"
            className="h-8 rounded-md border border-setta-200 bg-white px-2 text-xs font-semibold text-setta-600 transition-colors hover:bg-setta-100 focus-visible:ring-2 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200 dark:hover:bg-setta-800"
            onClick={applyPath}
          >
            Go
          </button>
        </div>
      </div>
      <div className="min-h-[220px] min-w-0 flex-1">
        <FileBrowserPane
          useFileBrowserStateHook={useHomeFileBrowserState}
          showPathNavigation={false}
          includeSettaInitializedFolders
          showSettaInitializedBadgePill={false}
          allowOutsideWorkspaceRoot
          metaPaddingClassName={HOME_FILE_BROWSER_META_INSET_CLASS}
          listInsetLeft={HOME_FILE_BROWSER_LIST_INSET_LEFT}
        />
      </div>
    </section>
  );
}
