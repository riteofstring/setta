import { callOpenAPI } from "@setta/app-subsystem-frontend-sdk";

import {
  SortableListProvider,
  useSortableListItem,
} from "components/Pages/Project/ViewModeDnd";

import _ from "lodash";

import {
  createViewMode,
  setActiveViewMode,
  toggleIsEditingViewMode,
  toggleViewModeTab,
  toggleViewModeUserFacing,
} from "openapi/http";

import { Resizable } from "re-resizable";

import { useEffect, useRef, useState } from "react";

import { FiCheck, FiChevronDown, FiEdit3, FiPlus } from "react-icons/fi";

import { HiCode } from "react-icons/hi";

import { RxDragHandleDots2 } from "react-icons/rx";

import { TbUser } from "react-icons/tb";

import { pruneActiveSectionIdsForViewMode } from "state/actions/activeSections";

import { useCreateAndGoToProjectConfig } from "state/actions/project/loadProject";

import { persistViewModeSortOrder } from "state/actions/viewModes";

import { useProjectState } from "state/definitions";

import { useShareCapabilities } from "state/hooks/share";

import { ViewMode } from "utils/generatedTypes";

import { sortViewModes } from "utils/viewModeOrdering";

import { ProjectConfigs } from "./ProjectConfigs";

import { WindowSpacesPane } from "./WindowSpacesPane";

import { ViewModeEditingRowContent } from "./viewModeRows";

export const PROJECT_CONFIGS_MIN_HEIGHT = 140;

export const VIEW_MODES_MIN_HEIGHT = 120;

export const PROJECT_CONFIGS_RESIZE_HANDLE_HEIGHT = 12;

export const OVERVIEW_ACTION_BUTTON_ENABLED_CLASSES =
  "cursor-pointer border-setta-200 text-setta-700 hover:bg-setta-100 dark:border-setta-800 dark:text-setta-300 dark:hover:bg-setta-800/50";

export const OVERVIEW_ACTION_BUTTON_DISABLED_CLASSES =
  "cursor-not-allowed border-setta-200 text-setta-300 opacity-60 dark:border-setta-800 dark:text-setta-600";

export const PROJECT_CONFIG_ACTION_BUTTON_ENABLED_CLASSES =
  "border-setta-200 text-setta-500 hover:bg-setta-100 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800";

export const PROJECT_CONFIG_ACTION_BUTTON_DISABLED_CLASSES =
  "cursor-not-allowed border-setta-200 text-setta-300 opacity-60 dark:border-setta-800 dark:text-setta-600";

export const VIEW_MODE_EDITING_ROW_BASE_CLASSES =
  "section-key-value group/viewmode box-border flex h-8 w-full min-w-0 cursor-pointer items-center gap-2 rounded border px-2 text-xs transition-colors";

export const VIEW_MODE_EDITING_ROW_ACTIVE_CLASSES =
  "border-blue-500/70 bg-blue-500/10 text-blue-700 dark:text-blue-300";

export const VIEW_MODE_EDITING_ROW_INACTIVE_CLASSES =
  "border-setta-200 text-setta-600 hover:border-setta-500/70 dark:border-setta-700 dark:text-setta-300 dark:hover:border-setta-500/70";

export const VIEW_MODE_INPUT_ACTIVE_CLASSES =
  "flex-1 truncate bg-transparent text-blue-700 focus:text-blue-700 focus:outline-none focus:ring-0 dark:text-blue-300 dark:focus:text-blue-200";

export const VIEW_MODE_INPUT_INACTIVE_CLASSES =
  "flex-1 truncate bg-transparent text-setta-500 focus:text-setta-900 focus:outline-none focus:ring-0 dark:text-setta-400 dark:focus:text-setta-100";

export const VIEW_MODE_INPUT_ERROR_CLASSES =
  "text-red-700 focus:text-red-700 dark:text-red-300 dark:focus:text-red-200";

export const VIEW_MODE_TOGGLE_ENABLED_CLASSES =
  "text-blue-500 hover:text-blue-400";

export const VIEW_MODE_TOGGLE_DISABLED_CLASSES =
  "text-setta-400 hover:text-setta-600";

export type OpenAPIRequest = Parameters<typeof callOpenAPI>[0];

export type ViewModeActions = ReturnType<typeof useViewModeActions>;

export type ViewModeSortableItem = ReturnType<typeof useSortableListItem>;

export function joinClasses(
  ...classes: Array<string | false | null | undefined>
) {
  return classes.filter(Boolean).join(" ");
}

export function normalizeViewModeName(value: string) {
  return value.trim();
}

export function sendOpenAPIRequest(
  enabled: boolean,
  request: OpenAPIRequest,
): void {
  if (!enabled) {
    return;
  }
  void callOpenAPI(request);
}

export function useObservedElementHeight(elementRef: {
  current: HTMLDivElement | null;
}) {
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const target = elementRef.current;
    if (!target) {
      return;
    }
    const updateHeight = () => {
      setHeight(target.clientHeight);
    };
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(target);
    return () => {
      observer.disconnect();
    };
  }, [elementRef]);

  return height;
}

export function clampProjectConfigsHeight(
  rawHeight: number,
  maxHeight: number,
) {
  return Math.max(PROJECT_CONFIGS_MIN_HEIGHT, Math.min(rawHeight, maxHeight));
}

export function useProjectConfigsPaneState(isViewModesCollapsed: boolean) {
  const [isProjectConfigsCollapsed, setIsProjectConfigsCollapsed] =
    useState(false);
  const [projectConfigsHeight, setProjectConfigsHeight] = useState(280);
  const panesContainerRef = useRef<HTMLDivElement | null>(null);
  const panesHeight = useObservedElementHeight(panesContainerRef);
  const availableProjectConfigsHeight =
    (panesHeight ?? 760) -
    (isViewModesCollapsed ? 0 : VIEW_MODES_MIN_HEIGHT) -
    PROJECT_CONFIGS_RESIZE_HANDLE_HEIGHT;
  const projectConfigsMaxHeight = Math.max(
    PROJECT_CONFIGS_MIN_HEIGHT,
    availableProjectConfigsHeight,
  );

  useEffect(() => {
    setProjectConfigsHeight((currentHeight) => {
      if (currentHeight <= projectConfigsMaxHeight) {
        return currentHeight;
      }
      return projectConfigsMaxHeight;
    });
  }, [projectConfigsMaxHeight]);

  function updateProjectConfigsHeight(rawHeight: number) {
    setProjectConfigsHeight(
      clampProjectConfigsHeight(rawHeight, projectConfigsMaxHeight),
    );
  }

  return {
    isProjectConfigsCollapsed,
    panesContainerRef,
    projectConfigsHeight,
    projectConfigsMaxHeight,
    setIsProjectConfigsCollapsed,
    updateProjectConfigsHeight,
  };
}

export function isSameViewModeOrder(
  viewModeList: Array<ViewMode>,
  nextOrderedIds: Array<string>,
) {
  const orderedIds = viewModeList.map((mode) => mode.id);
  return (
    nextOrderedIds.length === orderedIds.length &&
    nextOrderedIds.every((id, idx) => id === orderedIds[idx])
  );
}

export function useViewModeActions({
  projectConfigId,
  viewModeList,
  canEditVariants,
  canEditStructure,
  sortableEnabled,
}: {
  projectConfigId: string;
  viewModeList: Array<ViewMode>;
  canEditVariants: boolean;
  canEditStructure: boolean;
  sortableEnabled: boolean;
}) {
  return {
    handleCreateMode() {
      sendOpenAPIRequest(
        canEditStructure,
        createViewMode({
          body: { projectConfigId },
        } as Parameters<typeof createViewMode>[0]),
      );
    },
    handleModeChange(modeId: string) {
      sendOpenAPIRequest(
        canEditVariants,
        setActiveViewMode({
          body: {
            projectConfigId,
            activeViewModeId: modeId,
          },
        } as Parameters<typeof setActiveViewMode>[0]),
      );
    },
    handleReorder(nextOrderedIds: Array<string>) {
      if (
        !sortableEnabled ||
        isSameViewModeOrder(viewModeList, nextOrderedIds)
      ) {
        return;
      }
      persistViewModeSortOrder(projectConfigId, nextOrderedIds);
    },
    handleToggleEdit() {
      sendOpenAPIRequest(
        canEditStructure,
        toggleIsEditingViewMode({
          body: { projectConfigId },
        } as Parameters<typeof toggleIsEditingViewMode>[0]),
      );
    },
    handleToggleTab(modeId: string) {
      sendOpenAPIRequest(
        canEditStructure,
        toggleViewModeTab({
          body: {
            projectConfigId,
            viewModeId: modeId,
          },
        } as Parameters<typeof toggleViewModeTab>[0]),
      );
    },
    handleToggleUserFacing(modeId: string) {
      sendOpenAPIRequest(
        canEditStructure,
        toggleViewModeUserFacing({
          body: {
            projectConfigId,
            viewModeId: modeId,
          },
        } as Parameters<typeof toggleViewModeUserFacing>[0]),
      );
    },
  };
}

export function getEditModeButtonState(isEditingViewMode: boolean) {
  if (isEditingViewMode) {
    return {
      icon: <FiCheck size={16} />,
      label: "Done editing",
      title: "Done editing view modes",
    };
  }
  return {
    icon: <FiEdit3 size={16} />,
    label: "Edit",
    title: "Edit view modes",
  };
}

export function renderViewModeRow({
  mode,
  isActive,
  isEditingViewMode,
  canDeleteViewModes,
  projectConfigId,
  actions,
  canEditVariants,
  canEditStructure,
  sortableEnabled,
}: {
  mode: ViewMode;
  isActive: boolean;
  isEditingViewMode: boolean;
  canDeleteViewModes: boolean;
  projectConfigId: string;
  actions: ViewModeActions;
  canEditVariants: boolean;
  canEditStructure: boolean;
  sortableEnabled: boolean;
}) {
  if (!isEditingViewMode) {
    return (
      <ViewModeRow
        key={mode.id}
        mode={mode}
        isActive={isActive}
        onSelect={actions.handleModeChange}
        disabled={!canEditVariants}
        sortableEnabled={sortableEnabled}
      />
    );
  }
  return (
    <ViewModeEditingRow
      key={mode.id}
      mode={mode}
      isActive={isActive}
      isDeletable={canDeleteViewModes}
      projectConfigId={projectConfigId}
      onSelect={actions.handleModeChange}
      onToggleTab={actions.handleToggleTab}
      onToggleUserFacing={actions.handleToggleUserFacing}
      canEditVariants={canEditVariants}
      canEditStructure={canEditStructure}
      sortableEnabled={sortableEnabled}
    />
  );
}

export function ViewModeToolbar({
  canEditStructure,
  isEditingViewMode,
  onCreateMode,
  onToggleEdit,
}: {
  canEditStructure: boolean;
  isEditingViewMode: boolean;
  onCreateMode: () => void;
  onToggleEdit: () => void;
}) {
  const editButton = getEditModeButtonState(isEditingViewMode);
  const buttonClasses = canEditStructure
    ? OVERVIEW_ACTION_BUTTON_ENABLED_CLASSES
    : OVERVIEW_ACTION_BUTTON_DISABLED_CLASSES;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        className={`ml-auto flex items-center gap-2 rounded border px-2 py-1 text-xs transition-all ${buttonClasses}`}
        onClick={onToggleEdit}
        title={editButton.title}
        disabled={!canEditStructure}
      >
        <span className="text-setta-500 dark:text-setta-400">
          {editButton.icon}
        </span>
        {editButton.label}
      </button>
      <button
        className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-xs transition-all ${buttonClasses}`}
        onClick={onCreateMode}
        title="Create a new view mode"
        disabled={!canEditStructure}
      >
        <FiPlus size={14} />
        New View Mode
      </button>
    </div>
  );
}

export function ViewModesPane({
  activeViewModeId,
  actions,
  canDeleteViewModes,
  canEditStructure,
  canEditVariants,
  hasViewModes,
  isCollapsed,
  isEditingViewMode,
  onToggleCollapsed,
  projectConfigId,
  sortableEnabled,
  viewModeList,
}: {
  activeViewModeId: string;
  actions: ViewModeActions;
  canDeleteViewModes: boolean;
  canEditStructure: boolean;
  canEditVariants: boolean;
  hasViewModes: boolean;
  isCollapsed: boolean;
  isEditingViewMode: boolean;
  onToggleCollapsed: () => void;
  projectConfigId: string;
  sortableEnabled: boolean;
  viewModeList: Array<ViewMode>;
}) {
  const sectionClasses = joinClasses(
    "overflow-hidden rounded border border-setta-200/60 p-2 dark:border-setta-800/70",
    !isCollapsed && "min-h-[8rem] flex-1",
  );
  const toggleTitle = isCollapsed ? "Expand view modes" : "Collapse view modes";

  return (
    <section data-testid="view-modes-pane" className={sectionClasses}>
      <div className="mb-1 flex items-center gap-2">
        <button
          type="button"
          data-testid="view-modes-view-modes-toggle"
          className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-setta-400 transition-colors hover:text-setta-600 dark:hover:text-setta-200"
          onClick={onToggleCollapsed}
          aria-expanded={!isCollapsed}
          title={toggleTitle}
        >
          <FiChevronDown
            className={`h-3.5 w-3.5 transition-transform ${isCollapsed ? "-rotate-90" : "rotate-0"}`}
          />
          <span>View Modes</span>
        </button>
      </div>

      {isCollapsed ? null : (
        <div className="h-[calc(100%_-_1.5rem)] overflow-y-auto overflow-x-hidden pr-1">
          {hasViewModes ? null : (
            <div className="rounded border border-dashed border-setta-200 px-2 py-2 text-xs text-setta-500 dark:border-setta-800 dark:text-setta-400">
              No view modes yet. Create one to start customizing visibility.
            </div>
          )}

          <SortableListProvider
            id="overview-view-modes-sortable"
            items={viewModeList.map((mode) => mode.id)}
            direction="vertical"
            enabled={sortableEnabled}
            onReorder={actions.handleReorder}
          >
            <div className="flex w-full min-w-0 flex-col gap-0">
              {viewModeList.map((mode) =>
                renderViewModeRow({
                  mode,
                  isActive: activeViewModeId === mode.id,
                  isEditingViewMode,
                  canDeleteViewModes,
                  projectConfigId,
                  actions,
                  canEditVariants,
                  canEditStructure,
                  sortableEnabled,
                }),
              )}
            </div>
          </SortableListProvider>
        </div>
      )}
    </section>
  );
}

export function CreateProjectConfigButton({
  canEditStructure,
  onCreateProjectConfig,
}: {
  canEditStructure: boolean;
  onCreateProjectConfig: () => void;
}) {
  const buttonClasses = canEditStructure
    ? PROJECT_CONFIG_ACTION_BUTTON_ENABLED_CLASSES
    : PROJECT_CONFIG_ACTION_BUTTON_DISABLED_CLASSES;

  return (
    <button
      type="button"
      data-testid="view-modes-project-configs-create"
      className={`inline-flex items-center gap-1 rounded border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors ${buttonClasses}`}
      onClick={onCreateProjectConfig}
      disabled={!canEditStructure}
      title="Create and open a new project config"
    >
      <FiPlus size={11} />
      New Project Config
    </button>
  );
}

export function ProjectConfigsSectionHeader({
  isCollapsed,
  canEditStructure,
  onCreateProjectConfig,
  onToggleCollapsed,
}: {
  isCollapsed: boolean;
  canEditStructure: boolean;
  onCreateProjectConfig: () => void;
  onToggleCollapsed: () => void;
}) {
  const toggleTitle = isCollapsed
    ? "Expand project configs"
    : "Collapse project configs";

  return (
    <div className="mb-1 flex items-center justify-between gap-2">
      <button
        type="button"
        data-testid="view-modes-project-configs-toggle"
        className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-setta-400 transition-colors hover:text-setta-600 dark:hover:text-setta-200"
        onClick={onToggleCollapsed}
        aria-expanded={!isCollapsed}
        title={toggleTitle}
      >
        <FiChevronDown
          className={`h-3.5 w-3.5 transition-transform ${isCollapsed ? "-rotate-90" : "rotate-0"}`}
        />
        <span>Project Configs</span>
      </button>
      <CreateProjectConfigButton
        canEditStructure={canEditStructure}
        onCreateProjectConfig={onCreateProjectConfig}
      />
    </div>
  );
}

export function ProjectConfigsPane({
  canEditStructure,
  isCollapsed,
  isViewModesCollapsed,
  onCreateProjectConfig,
  onResize,
  onToggleCollapsed,
  projectConfigsHeight,
  projectConfigsMaxHeight,
}: {
  canEditStructure: boolean;
  isCollapsed: boolean;
  isViewModesCollapsed: boolean;
  onCreateProjectConfig: () => void;
  onResize: (rawHeight: number) => void;
  onToggleCollapsed: () => void;
  projectConfigsHeight: number;
  projectConfigsMaxHeight: number;
}) {
  if (isCollapsed) {
    return (
      <section className="mt-2 overflow-hidden rounded border border-setta-200/60 p-2 dark:border-setta-800/70">
        <ProjectConfigsSectionHeader
          isCollapsed
          canEditStructure={canEditStructure}
          onCreateProjectConfig={onCreateProjectConfig}
          onToggleCollapsed={onToggleCollapsed}
        />
      </section>
    );
  }

  return (
    <Resizable
      className="mt-2"
      size={{ width: "100%", height: projectConfigsHeight }}
      minHeight={PROJECT_CONFIGS_MIN_HEIGHT}
      maxHeight={projectConfigsMaxHeight}
      enable={{
        top: !isViewModesCollapsed,
        right: false,
        bottom: false,
        left: false,
        topRight: false,
        bottomRight: false,
        bottomLeft: false,
        topLeft: false,
      }}
      handleComponent={{
        top: (
          <div
            data-testid="view-modes-project-configs-resize-handle"
            className="group flex h-3 cursor-row-resize select-none items-center justify-center border-0 outline-none"
            title="Drag to resize project configs"
          >
            <div className="h-[2px] w-20 rounded-full bg-setta-500/70 transition-colors group-hover:bg-blue-500 dark:bg-setta-500 dark:group-hover:bg-blue-300" />
          </div>
        ),
      }}
      handleStyles={{
        top: {
          top: "-9px",
        },
      }}
      onResize={(_event, _direction, elementRef) => {
        onResize(elementRef.offsetHeight);
      }}
      onResizeStop={(_event, _direction, elementRef) => {
        onResize(elementRef.offsetHeight);
      }}
    >
      <section className="flex h-full min-h-0 flex-col overflow-hidden rounded border border-setta-200/60 p-2 dark:border-setta-800/70">
        <ProjectConfigsSectionHeader
          isCollapsed={false}
          canEditStructure={canEditStructure}
          onCreateProjectConfig={onCreateProjectConfig}
          onToggleCollapsed={onToggleCollapsed}
        />
        <div
          className="min-h-0 flex-1"
          data-testid="view-modes-project-configs-section"
        >
          <ProjectConfigs />
        </div>
      </section>
    </Resizable>
  );
}

export function ViewingEditingMode() {
  const { projectConfigId, viewModeList, activeViewModeId, isEditingViewMode } =
    useProjectState((x) => {
      const sortedViewModes = sortViewModes(
        Object.values(x.projectConfig.viewModes),
      );
      return {
        projectConfigId: x.projectConfig.id,
        viewModeList: sortedViewModes,
        activeViewModeId: x.projectConfig.activeViewModeId,
        isEditingViewMode: x.projectConfig.isEditingViewMode,
      };
    }, _.isEqual);
  const { canEditVariants, canEditStructure, canEditLayout } =
    useShareCapabilities();
  const createAndGoToProjectConfig = useCreateAndGoToProjectConfig();
  const [isViewModesCollapsed, setIsViewModesCollapsed] = useState(false);
  const hasViewModes = viewModeList.length > 0;
  const canDeleteViewModes = viewModeList.length > 1;
  const sortableEnabled = canEditStructure && viewModeList.length > 1;
  const {
    isProjectConfigsCollapsed,
    panesContainerRef,
    projectConfigsHeight,
    projectConfigsMaxHeight,
    setIsProjectConfigsCollapsed,
    updateProjectConfigsHeight,
  } = useProjectConfigsPaneState(isViewModesCollapsed);
  const actions = useViewModeActions({
    projectConfigId,
    viewModeList,
    canEditVariants,
    canEditStructure,
    sortableEnabled,
  });
  useEffect(() => {
    pruneActiveSectionIdsForViewMode(activeViewModeId, isEditingViewMode);
  }, [activeViewModeId, isEditingViewMode]);
  function handleCreateProjectConfig() {
    if (!canEditStructure) {
      return;
    }
    void createAndGoToProjectConfig();
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-2">
      <ViewModeToolbar
        canEditStructure={canEditStructure}
        isEditingViewMode={isEditingViewMode}
        onCreateMode={actions.handleCreateMode}
        onToggleEdit={actions.handleToggleEdit}
      />

      <WindowSpacesPane
        isEditing={isEditingViewMode}
        canEditLayout={canEditLayout}
      />

      <div
        ref={panesContainerRef}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <ViewModesPane
          activeViewModeId={activeViewModeId}
          actions={actions}
          canDeleteViewModes={canDeleteViewModes}
          canEditStructure={canEditStructure}
          canEditVariants={canEditVariants}
          hasViewModes={hasViewModes}
          isCollapsed={isViewModesCollapsed}
          isEditingViewMode={isEditingViewMode}
          onToggleCollapsed={() => setIsViewModesCollapsed((prev) => !prev)}
          projectConfigId={projectConfigId}
          sortableEnabled={sortableEnabled}
          viewModeList={viewModeList}
        />
        <ProjectConfigsPane
          canEditStructure={canEditStructure}
          isCollapsed={isProjectConfigsCollapsed}
          isViewModesCollapsed={isViewModesCollapsed}
          onCreateProjectConfig={handleCreateProjectConfig}
          onResize={updateProjectConfigsHeight}
          onToggleCollapsed={() =>
            setIsProjectConfigsCollapsed((previous) => !previous)
          }
          projectConfigsHeight={projectConfigsHeight}
          projectConfigsMaxHeight={projectConfigsMaxHeight}
        />
      </div>
    </div>
  );
}

export type ViewModeRowProps = {
  mode: ViewMode;
  isActive: boolean;
  onSelect: (modeId: string) => void;
  disabled: boolean;
  sortableEnabled: boolean;
};

export function ViewModeRow({ sortableEnabled, ...props }: ViewModeRowProps) {
  if (!sortableEnabled) {
    return <ViewModeRowContent {...props} sortable={null} />;
  }
  return <ViewModeRowSortable {...props} sortableEnabled />;
}

export function ViewModeRowSortable({
  mode,
  isActive,
  onSelect,
  disabled,
}: ViewModeRowProps) {
  const sortable = useSortableListItem(mode.id, false, "vertical");
  return (
    <ViewModeRowContent
      mode={mode}
      isActive={isActive}
      onSelect={onSelect}
      disabled={disabled}
      sortable={sortable}
    />
  );
}

export function ViewModeRowContent({
  mode,
  isActive,
  onSelect,
  disabled,
  sortable,
}: Omit<ViewModeRowProps, "sortableEnabled"> & {
  sortable: ViewModeSortableItem | null;
}) {
  let modeLabel = mode.name;
  if (!modeLabel) {
    modeLabel = "Untitled View";
  }
  let icon = <HiCode size={18} />;
  if (mode.isUserFacing) {
    icon = <TbUser size={18} />;
  }
  const baseClasses =
    "box-border flex h-8 w-full min-w-0 items-center gap-2 rounded-md border border-transparent px-2 text-xs transition-colors";
  const activeClasses =
    "border-blue-500/40 bg-white text-blue-600 dark:border-blue-500/35 dark:bg-setta-800 dark:text-blue-300";
  const inactiveClasses =
    "text-setta-700 hover:border-setta-500/30 hover:bg-setta-100 dark:text-setta-300 dark:hover:border-setta-500/30 dark:hover:bg-setta-800/50";
  const rowClasses = isActive
    ? `${baseClasses} ${activeClasses}`
    : `${baseClasses} ${inactiveClasses}`;
  const iconClasses = isActive
    ? "text-blue-600 dark:text-blue-300"
    : "text-setta-500 dark:text-setta-400";
  return (
    <button
      ref={sortable?.setNodeRef}
      data-testid="overview-view-mode-row"
      data-view-mode-id={mode.id}
      className={rowClasses}
      style={sortable?.style}
      onClick={disabled ? undefined : () => onSelect(mode.id)}
      title={modeLabel}
      disabled={disabled}
    >
      {sortable && (
        <span
          ref={sortable.setActivatorNodeRef}
          data-testid="overview-view-mode-drag-handle"
          className="inline-flex h-full w-4 shrink-0 cursor-grab touch-none items-center justify-center text-setta-400 active:cursor-grabbing dark:text-setta-500"
          {...sortable.attributes}
          {...sortable.listeners}
          onClick={(event) => event.stopPropagation()}
        >
          <RxDragHandleDots2 className="h-3.5 w-3.5 shrink-0" />
        </span>
      )}
      <span className={`flex items-center justify-center ${iconClasses}`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-left">{modeLabel}</span>
    </button>
  );
}

export type ViewModeEditingRowProps = {
  mode: ViewMode;
  isActive: boolean;
  isDeletable: boolean;
  projectConfigId: string;
  onSelect: (modeId: string) => void;
  onToggleTab: (modeId: string) => void;
  onToggleUserFacing: (modeId: string) => void;
  canEditVariants: boolean;
  canEditStructure: boolean;
  sortableEnabled: boolean;
};

export function ViewModeEditingRow({
  sortableEnabled,
  ...props
}: ViewModeEditingRowProps) {
  if (!sortableEnabled) {
    return <ViewModeEditingRowContent {...props} sortable={null} />;
  }
  return <ViewModeEditingRowSortable {...props} sortableEnabled />;
}

export function ViewModeEditingRowSortable({
  mode,
  isActive,
  isDeletable,
  projectConfigId,
  onSelect,
  onToggleTab,
  onToggleUserFacing,
  canEditVariants,
  canEditStructure,
}: ViewModeEditingRowProps) {
  const sortable = useSortableListItem(mode.id, false, "vertical");
  return (
    <ViewModeEditingRowContent
      mode={mode}
      isActive={isActive}
      isDeletable={isDeletable}
      projectConfigId={projectConfigId}
      onSelect={onSelect}
      onToggleTab={onToggleTab}
      onToggleUserFacing={onToggleUserFacing}
      canEditVariants={canEditVariants}
      canEditStructure={canEditStructure}
      sortable={sortable}
    />
  );
}

export function createProtectedClickHandler(
  canRun: boolean,
  action: () => void,
) {
  return (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!canRun) {
      return;
    }
    action();
  };
}

export function stopEventPropagation(event: { stopPropagation: () => void }) {
  event.stopPropagation();
}

export function getViewModeEditingRowState({
  isActive,
  canEditVariants,
  hasValidationError,
  isUserFacing,
  isTab,
}: {
  isActive: boolean;
  canEditVariants: boolean;
  hasValidationError: boolean;
  isUserFacing: boolean;
  isTab: boolean;
}) {
  return {
    inputClasses: joinClasses(
      isActive
        ? VIEW_MODE_INPUT_ACTIVE_CLASSES
        : VIEW_MODE_INPUT_INACTIVE_CLASSES,
      hasValidationError && VIEW_MODE_INPUT_ERROR_CLASSES,
    ),
    rowClasses: joinClasses(
      VIEW_MODE_EDITING_ROW_BASE_CLASSES,
      isActive
        ? VIEW_MODE_EDITING_ROW_ACTIVE_CLASSES
        : VIEW_MODE_EDITING_ROW_INACTIVE_CLASSES,
      !canEditVariants && "cursor-not-allowed opacity-60",
      hasValidationError && "border-red-400/80 text-red-700 dark:text-red-300",
    ),
    tabState: isTab
      ? {
          className: VIEW_MODE_TOGGLE_ENABLED_CLASSES,
          title: "Shown as a tab",
        }
      : {
          className: VIEW_MODE_TOGGLE_DISABLED_CLASSES,
          title: "Not shown as a tab",
        },
    userFacingState: isUserFacing
      ? {
          className: VIEW_MODE_TOGGLE_ENABLED_CLASSES,
          icon: <TbUser size={16} />,
          title: "User-facing",
        }
      : {
          className: VIEW_MODE_TOGGLE_DISABLED_CLASSES,
          icon: <HiCode size={16} />,
          title: "Developer-facing",
        },
  };
}
