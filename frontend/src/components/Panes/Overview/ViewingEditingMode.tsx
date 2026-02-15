import {
  useViewModeSortableItem,
  ViewModeSortableProvider,
} from "components/Pages/Project/ViewModeDnd";
import _ from "lodash";
import { Resizable } from "re-resizable";
import { useEffect, useRef, useState } from "react";
import {
  FiBookmark,
  FiCheck,
  FiChevronDown,
  FiEdit3,
  FiPlus,
} from "react-icons/fi";
import { HiCode } from "react-icons/hi";
import { RxDragHandleDots2 } from "react-icons/rx";
import { TbUser } from "react-icons/tb";
import { pruneActiveSectionIdsForViewMode } from "state/actions/activeSections";
import { useCreateAndGoToProjectConfig } from "state/actions/project/loadProject";
import { dispatchOptimisticProjectStateUpdate } from "state/actions/sectionInfos";
import { persistViewModeSortOrder } from "state/actions/viewModes";
import { useProjectState } from "state/definitions";
import { useEditableOnSubmit } from "state/hooks/editableText";
import { useShareCapabilities } from "state/hooks/share";
import {
  route_create_view_mode,
  route_delete_view_mode,
  route_set_active_view_mode,
  route_set_view_mode_name,
  route_toggle_is_editing_view_mode,
  route_toggle_view_mode_tab,
  route_toggle_view_mode_user_facing,
} from "utils/generatedEndpoints";
import { ViewModeConfig } from "utils/generatedTypes";
import {
  sanitizeNameForSlug,
  validateViewModeNameInput,
} from "utils/nameValidation";
import { sortViewModes } from "utils/viewModeOrdering";
import { ProjectConfigs } from "./ProjectConfigs";

const PROJECT_CONFIGS_MIN_HEIGHT = 140;
const VIEW_MODES_MIN_HEIGHT = 120;
const PROJECT_CONFIGS_RESIZE_HANDLE_HEIGHT = 12;

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
  const { canEditVariants, canEditStructure } = useShareCapabilities();
  const createAndGoToProjectConfig = useCreateAndGoToProjectConfig();
  const [isViewModesCollapsed, setIsViewModesCollapsed] = useState(false);
  const [isProjectConfigsCollapsed, setIsProjectConfigsCollapsed] =
    useState(false);
  const [projectConfigsHeight, setProjectConfigsHeight] = useState(280);
  const [panesHeight, setPanesHeight] = useState<number | null>(null);
  const panesContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const target = panesContainerRef.current;
    if (!target) {
      return;
    }
    const updateHeight = () => {
      setPanesHeight(target.clientHeight);
    };
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(target);
    return () => {
      observer.disconnect();
    };
  }, []);

  const editLabel = isEditingViewMode ? "Done editing" : "Edit";
  const editTitle = isEditingViewMode
    ? "Done editing view modes"
    : "Edit view modes";
  let editIcon = <FiEdit3 size={16} />;
  if (isEditingViewMode) {
    editIcon = <FiCheck size={16} />;
  }
  const hasViewModes = viewModeList.length > 0;
  const canDeleteViewModes = viewModeList.length > 1;

  useEffect(() => {
    pruneActiveSectionIdsForViewMode(activeViewModeId, isEditingViewMode);
  }, [activeViewModeId, isEditingViewMode]);

  const handleModeChange = (modeId: string) => {
    if (!canEditVariants) {
      return;
    }
    void route_set_active_view_mode({
      projectConfigId,
      activeViewModeId: modeId,
    });
  };

  const handleToggleEdit = () => {
    if (!canEditStructure) {
      return;
    }
    void route_toggle_is_editing_view_mode({ projectConfigId });
  };

  const handleCreateMode = (): void => {
    if (!canEditStructure) {
      return;
    }
    void route_create_view_mode({ projectConfigId });
  };

  const handleToggleUserFacing = (modeId: string): void => {
    if (!canEditStructure) {
      return;
    }
    void route_toggle_view_mode_user_facing({
      projectConfigId,
      viewModeId: modeId,
    });
  };

  const handleToggleTab = (modeId: string): void => {
    if (!canEditStructure) {
      return;
    }
    void route_toggle_view_mode_tab({
      projectConfigId,
      viewModeId: modeId,
    });
  };

  const handleReorder = (nextOrderedIds: Array<string>): void => {
    if (!canEditStructure) {
      return;
    }
    const orderedIds = viewModeList.map((mode) => mode.id);
    if (
      nextOrderedIds.length !== orderedIds.length ||
      nextOrderedIds.every((id, idx) => id === orderedIds[idx])
    ) {
      return;
    }
    persistViewModeSortOrder(projectConfigId, nextOrderedIds);
  };
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
    const clampedHeight = Math.max(
      PROJECT_CONFIGS_MIN_HEIGHT,
      Math.min(rawHeight, projectConfigsMaxHeight),
    );
    setProjectConfigsHeight(clampedHeight);
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          className={`ml-auto flex items-center gap-2 rounded border px-2 py-1 text-xs transition-all ${
            canEditStructure
              ? "cursor-pointer border-setta-200 text-setta-700 hover:bg-setta-100 dark:border-setta-800 dark:text-setta-300 dark:hover:bg-setta-800/50"
              : "cursor-not-allowed border-setta-200 text-setta-300 opacity-60 dark:border-setta-800 dark:text-setta-600"
          }`}
          onClick={handleToggleEdit}
          title={editTitle}
          disabled={!canEditStructure}
        >
          <span className="text-setta-500 dark:text-setta-400">{editIcon}</span>
          {editLabel}
        </button>
        <button
          className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-xs transition-all ${
            canEditStructure
              ? "cursor-pointer border-setta-200 text-setta-700 hover:bg-setta-100 dark:border-setta-800 dark:text-setta-300 dark:hover:bg-setta-800/50"
              : "cursor-not-allowed border-setta-200 text-setta-300 opacity-60 dark:border-setta-800 dark:text-setta-600"
          }`}
          onClick={handleCreateMode}
          title="Create a new view mode"
          disabled={!canEditStructure}
        >
          <FiPlus size={14} />
          New View Mode
        </button>
      </div>

      <div
        ref={panesContainerRef}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <section
          className={`overflow-hidden rounded border border-setta-200/60 p-2 dark:border-setta-800/70 ${
            isViewModesCollapsed ? "" : "min-h-[8rem] flex-1"
          }`}
        >
          <div className="mb-1 flex items-center gap-2">
            <button
              type="button"
              data-testid="view-modes-view-modes-toggle"
              className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-setta-400 transition-colors hover:text-setta-600 dark:hover:text-setta-200"
              onClick={() => setIsViewModesCollapsed((prev) => !prev)}
              aria-expanded={!isViewModesCollapsed}
              title={
                isViewModesCollapsed
                  ? "Expand view modes"
                  : "Collapse view modes"
              }
            >
              <FiChevronDown
                className={`h-3.5 w-3.5 transition-transform ${
                  isViewModesCollapsed ? "-rotate-90" : "rotate-0"
                }`}
              />
              <span>View Modes</span>
            </button>
          </div>

          {!isViewModesCollapsed && (
            <div className="h-[calc(100%_-_1.5rem)] overflow-y-auto overflow-x-hidden pr-1">
              {!hasViewModes && (
                <div className="rounded border border-dashed border-setta-200 px-2 py-2 text-xs text-setta-500 dark:border-setta-800 dark:text-setta-400">
                  No view modes yet. Create one to start customizing visibility.
                </div>
              )}

              <ViewModeSortableProvider
                id="overview-view-modes-sortable"
                items={viewModeList.map((mode) => mode.id)}
                direction="vertical"
                onReorder={handleReorder}
              >
                <div className="flex w-full min-w-0 flex-col gap-0">
                  {viewModeList.map((mode) => {
                    const isActive = activeViewModeId === mode.id;
                    if (isEditingViewMode) {
                      return (
                        <ViewModeEditingRow
                          key={mode.id}
                          mode={mode}
                          isActive={isActive}
                          isDeletable={canDeleteViewModes}
                          projectConfigId={projectConfigId}
                          onSelect={handleModeChange}
                          onToggleTab={handleToggleTab}
                          onToggleUserFacing={handleToggleUserFacing}
                          canEditVariants={canEditVariants}
                          canEditStructure={canEditStructure}
                          sortableEnabled={canEditStructure}
                        />
                      );
                    }

                    return (
                      <ViewModeRow
                        key={mode.id}
                        mode={mode}
                        isActive={isActive}
                        onSelect={handleModeChange}
                        disabled={!canEditVariants}
                        sortableEnabled={canEditStructure}
                      />
                    );
                  })}
                </div>
              </ViewModeSortableProvider>
            </div>
          )}
        </section>

        {isProjectConfigsCollapsed ? (
          <section className="mt-2 overflow-hidden rounded border border-setta-200/60 p-2 dark:border-setta-800/70">
            <div className="mb-1 flex items-center justify-between gap-2">
              <button
                type="button"
                data-testid="view-modes-project-configs-toggle"
                className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-setta-400 transition-colors hover:text-setta-600 dark:hover:text-setta-200"
                onClick={() => setIsProjectConfigsCollapsed(false)}
                aria-expanded={false}
                title="Expand project configs"
              >
                <FiChevronDown className="h-3.5 w-3.5 -rotate-90 transition-transform" />
                <span>Project Configs</span>
              </button>
              <button
                type="button"
                data-testid="view-modes-project-configs-create"
                className={`inline-flex items-center gap-1 rounded border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors ${
                  canEditStructure
                    ? "border-setta-200 text-setta-500 hover:bg-setta-100 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
                    : "cursor-not-allowed border-setta-200 text-setta-300 opacity-60 dark:border-setta-800 dark:text-setta-600"
                }`}
                onClick={() => {
                  if (!canEditStructure) {
                    return;
                  }
                  void createAndGoToProjectConfig();
                }}
                disabled={!canEditStructure}
                title="Create and open a new project config"
              >
                <FiPlus size={11} />
                New Project Config
              </button>
            </div>
          </section>
        ) : (
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
              updateProjectConfigsHeight(elementRef.offsetHeight);
            }}
            onResizeStop={(_event, _direction, elementRef) => {
              updateProjectConfigsHeight(elementRef.offsetHeight);
            }}
          >
            <section className="flex h-full min-h-0 flex-col overflow-hidden rounded border border-setta-200/60 p-2 dark:border-setta-800/70">
              <div className="mb-1 flex items-center justify-between gap-2">
                <button
                  type="button"
                  data-testid="view-modes-project-configs-toggle"
                  className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-setta-400 transition-colors hover:text-setta-600 dark:hover:text-setta-200"
                  onClick={() => setIsProjectConfigsCollapsed(true)}
                  aria-expanded
                  title="Collapse project configs"
                >
                  <FiChevronDown className="h-3.5 w-3.5 transition-transform" />
                  <span>Project Configs</span>
                </button>
                <button
                  type="button"
                  data-testid="view-modes-project-configs-create"
                  className={`inline-flex items-center gap-1 rounded border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors ${
                    canEditStructure
                      ? "border-setta-200 text-setta-500 hover:bg-setta-100 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
                      : "cursor-not-allowed border-setta-200 text-setta-300 opacity-60 dark:border-setta-800 dark:text-setta-600"
                  }`}
                  onClick={() => {
                    if (!canEditStructure) {
                      return;
                    }
                    void createAndGoToProjectConfig();
                  }}
                  disabled={!canEditStructure}
                  title="Create and open a new project config"
                >
                  <FiPlus size={11} />
                  New Project Config
                </button>
              </div>
              <div
                className="min-h-0 flex-1"
                data-testid="view-modes-project-configs-section"
              >
                <ProjectConfigs />
              </div>
            </section>
          </Resizable>
        )}
      </div>
    </div>
  );
}

type ViewModeRowProps = {
  mode: ViewModeConfig;
  isActive: boolean;
  onSelect: (modeId: string) => void;
  disabled: boolean;
  sortableEnabled: boolean;
};

function ViewModeRow({
  mode,
  isActive,
  onSelect,
  disabled,
  sortableEnabled,
}: ViewModeRowProps) {
  const sortable = useViewModeSortableItem(
    mode.id,
    !sortableEnabled,
    "vertical",
  );
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
      ref={sortable.setNodeRef}
      data-testid="overview-view-mode-row"
      data-view-mode-id={mode.id}
      className={rowClasses}
      style={sortable.style}
      onClick={disabled ? undefined : () => onSelect(mode.id)}
      title={modeLabel}
      disabled={disabled}
    >
      {sortableEnabled && (
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

type ViewModeEditingRowProps = {
  mode: ViewModeConfig;
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

function ViewModeEditingRow({
  mode,
  isActive,
  isDeletable,
  projectConfigId,
  onSelect,
  onToggleTab,
  onToggleUserFacing,
  canEditVariants,
  canEditStructure,
  sortableEnabled,
}: ViewModeEditingRowProps) {
  const sortable = useViewModeSortableItem(
    mode.id,
    !sortableEnabled,
    "vertical",
  );
  const normalizeName = (value: string) => value.trim();

  function onSetName(name: string) {
    if (!canEditStructure) {
      return;
    }
    const previousName =
      useProjectState.getState().projectConfig.viewModes[mode.id]?.name ??
      mode.name;
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        if (!(mode.id in state.projectConfig.viewModes)) {
          throw new Error(`View mode ${mode.id} not found`);
        }
        state.projectConfig.viewModes[mode.id].name = name;
      },
      send: (frontendOpId) =>
        route_set_view_mode_name({
          projectConfigId,
          viewModeId: mode.id,
          name,
          frontendOpId,
        }),
      rollback: (state) => {
        if (!(mode.id in state.projectConfig.viewModes)) {
          throw new Error(`View mode ${mode.id} not found`);
        }
        state.projectConfig.viewModes[mode.id].name = previousName;
      },
    });
  }

  function conditionToSetName(name: string) {
    const normalized = normalizeName(name);
    const validationError = validateViewModeNameInput(normalized);
    if (validationError) {
      return false;
    }
    const nextSlug = sanitizeNameForSlug(normalized);
    const state = useProjectState.getState();
    for (const viewMode of Object.values(state.projectConfig.viewModes)) {
      if (viewMode.id === mode.id) {
        continue;
      }
      if (sanitizeNameForSlug(viewMode.name) === nextSlug) {
        return false;
      }
    }
    return true;
  }

  const { inputValue, onChange, onBlur, onKeyDown } = useEditableOnSubmit(
    mode.name,
    onSetName,
    conditionToSetName,
    false,
    normalizeName,
  );

  const handleToggleUserFacing = (
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    event.stopPropagation();
    if (!canEditStructure) {
      return;
    }
    onToggleUserFacing(mode.id);
  };

  const handleToggleTab = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!canEditStructure) {
      return;
    }
    onToggleTab(mode.id);
  };

  const handleDelete = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!canEditStructure) {
      return;
    }
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        const { viewModes } = state.projectConfig;
        if (!(mode.id in viewModes)) {
          throw new Error(`View mode ${mode.id} not found`);
        }
        if (Object.keys(viewModes).length < 2) {
          return;
        }
        delete viewModes[mode.id];
        if (state.projectConfig.activeViewModeId === mode.id) {
          const sortedViewModes = sortViewModes(Object.values(viewModes));
          const nextViewMode = sortedViewModes[0] ?? null;
          state.projectConfig.activeViewModeId = nextViewMode?.id ?? null;
          if (nextViewMode) {
            if (Object.keys(nextViewMode.topLevelSections).length === 0) {
              const clonedTopLevelSections: typeof state.projectConfig.topLevelSections =
                {};
              for (const sectionId in state.projectConfig.topLevelSections) {
                clonedTopLevelSections[sectionId] = {
                  ...state.projectConfig.topLevelSections[sectionId],
                };
              }
              nextViewMode.topLevelSections = clonedTopLevelSections;
            }
            state.projectConfig.topLevelSections =
              nextViewMode.topLevelSections;
            state.projectConfig.viewport = nextViewMode.viewport;
            state.projectConfig.viewportInitialized =
              nextViewMode.viewportInitialized;
          }
        }
      },
      send: (frontendOpId) =>
        route_delete_view_mode({
          projectConfigId,
          viewModeId: mode.id,
          frontendOpId,
        }),
    });
  };

  const handleInputClick = (event: React.MouseEvent<HTMLInputElement>) => {
    event.stopPropagation();
  };
  const stopDragPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  const baseClasses =
    "section-key-value group/viewmode box-border flex h-8 w-full min-w-0 cursor-pointer items-center gap-2 rounded border px-2 text-xs transition-colors";
  const activeClasses =
    "border-blue-500/70 bg-blue-500/10 text-blue-700 dark:text-blue-300";
  const inactiveClasses =
    "border-setta-200 text-setta-600 hover:border-setta-500/70 dark:border-setta-700 dark:text-setta-300 dark:hover:border-setta-500/70";
  const rowClasses = isActive
    ? `${baseClasses} ${activeClasses}`
    : `${baseClasses} ${inactiveClasses}`;
  const inputClasses = isActive
    ? "flex-1 truncate bg-transparent text-blue-700 focus:text-blue-700 focus:outline-none focus:ring-0 dark:text-blue-300 dark:focus:text-blue-200"
    : "flex-1 truncate bg-transparent text-setta-500 focus:text-setta-900 focus:outline-none focus:ring-0 dark:text-setta-400 dark:focus:text-setta-100";

  let userFacingClasses = "text-setta-400 hover:text-setta-600";
  let userFacingIcon = <HiCode size={16} />;
  let userFacingTitle = "Developer-facing";
  if (mode.isUserFacing) {
    userFacingClasses = "text-blue-500 hover:text-blue-400";
    userFacingIcon = <TbUser size={16} />;
    userFacingTitle = "User-facing";
  }

  let tabClasses = "text-setta-400 hover:text-setta-600";
  let tabTitle = "Not shown as a tab";
  if (mode.isTab) {
    tabClasses = "text-blue-500 hover:text-blue-400";
    tabTitle = "Shown as a tab";
  }

  const rowClick = canEditVariants ? () => onSelect(mode.id) : undefined;
  return (
    <div
      ref={sortable.setNodeRef}
      data-testid="overview-view-mode-edit-row"
      data-view-mode-id={mode.id}
      style={sortable.style}
      className={`${rowClasses} ${
        canEditVariants ? "" : "cursor-not-allowed opacity-60"
      }`}
      onClick={rowClick}
    >
      {sortableEnabled && (
        <span
          ref={sortable.setActivatorNodeRef}
          data-testid="overview-view-mode-edit-drag-handle"
          className="inline-flex h-full w-4 shrink-0 cursor-grab touch-none items-center justify-center text-setta-400 active:cursor-grabbing dark:text-setta-500"
          {...sortable.attributes}
          {...sortable.listeners}
          onClick={(event) => event.stopPropagation()}
        >
          <RxDragHandleDots2 className="h-3.5 w-3.5 shrink-0" />
        </span>
      )}
      <input
        value={inputValue}
        onChange={onChange}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        onClick={handleInputClick}
        onPointerDown={stopDragPointerDown}
        placeholder="View mode name"
        className={inputClasses}
        disabled={!canEditStructure}
      />
      <button
        className={`cursor-pointer bg-transparent ${tabClasses}`}
        onClick={handleToggleTab}
        onPointerDown={stopDragPointerDown}
        title={tabTitle}
        disabled={!canEditStructure}
      >
        <FiBookmark size={16} />
      </button>
      <button
        className={`cursor-pointer bg-transparent ${userFacingClasses}`}
        onClick={handleToggleUserFacing}
        onPointerDown={stopDragPointerDown}
        title={userFacingTitle}
        disabled={!canEditStructure}
      >
        {userFacingIcon}
      </button>
      {isDeletable && (
        <button
          className="cursor-pointer bg-transparent text-transparent hover:!text-red-500 active:!text-red-700 group-hover/viewmode:text-setta-400/50"
          onClick={handleDelete}
          onPointerDown={stopDragPointerDown}
          title="Delete view mode"
          disabled={!canEditStructure}
        >
          <i className="gg-trash" />
        </button>
      )}
    </div>
  );
}
