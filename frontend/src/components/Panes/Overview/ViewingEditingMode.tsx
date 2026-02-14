import _ from "lodash";
import { type MouseEvent, useEffect, useRef, useState } from "react";
import { FiBookmark, FiCheck, FiEdit3 } from "react-icons/fi";
import { HiCode } from "react-icons/hi";
import { TbUser } from "react-icons/tb";
import { pruneActiveSectionIdsForViewMode } from "state/actions/activeSections";
import { dispatchOptimisticProjectStateUpdate } from "state/actions/sectionInfos";
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
import { clamp } from "utils/utils";

const VIEW_MODE_TABS_PANEL_MIN_HEIGHT = 88;
const VIEW_MODE_TABS_PANEL_DEFAULT_HEIGHT = 132;
const VIEW_MODE_TOP_PANEL_MIN_HEIGHT = 180;

export function clampViewModesTabsPanelHeight({
  requestedHeight,
  containerHeight,
}: {
  requestedHeight: number;
  containerHeight: number;
}) {
  if (!Number.isFinite(containerHeight) || containerHeight <= 0) {
    return VIEW_MODE_TABS_PANEL_MIN_HEIGHT;
  }
  const maxHeight = Math.max(
    VIEW_MODE_TABS_PANEL_MIN_HEIGHT,
    containerHeight - VIEW_MODE_TOP_PANEL_MIN_HEIGHT,
  );
  return clamp(requestedHeight, VIEW_MODE_TABS_PANEL_MIN_HEIGHT, maxHeight);
}

export function applyViewModesTabsPanelResize({
  startHeight,
  deltaY,
  containerHeight,
}: {
  startHeight: number;
  deltaY: number;
  containerHeight: number;
}) {
  return clampViewModesTabsPanelHeight({
    requestedHeight: startHeight + deltaY,
    containerHeight,
  });
}

export function ViewingEditingMode() {
  const { projectConfigId, viewModeList, activeViewModeId, isEditingViewMode } =
    useProjectState((x) => {
      const viewModeList = sortViewModes(
        Object.values(x.projectConfig.viewModes),
      );
      const activeViewModeId = x.projectConfig.activeViewModeId;
      const isEditingViewMode = x.projectConfig.isEditingViewMode;
      return {
        projectConfigId: x.projectConfig.id,
        viewModeList,
        activeViewModeId,
        isEditingViewMode,
      };
    }, _.isEqual);
  const { canEditVariants, canEditStructure } = useShareCapabilities();
  const tabModeList = viewModeList.filter((mode) => mode.isTab);
  const hasTabModes = tabModeList.length > 0;
  const [tabsPanelHeight, setTabsPanelHeight] = useState(
    VIEW_MODE_TABS_PANEL_DEFAULT_HEIGHT,
  );
  const [tabsPanelCollapsed, setTabsPanelCollapsed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(0);
  const resizeRafRef = useRef<number | null>(null);

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
  const tabsPanelDisabled = !hasTabModes;
  const isTabsPanelCollapsed = tabsPanelDisabled ? true : tabsPanelCollapsed;
  const effectiveTabsPanelHeight = clampViewModesTabsPanelHeight({
    requestedHeight: tabsPanelHeight,
    containerHeight,
  });

  useEffect(() => {
    pruneActiveSectionIdsForViewMode(activeViewModeId, isEditingViewMode);
  }, [activeViewModeId, isEditingViewMode]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) {
        return;
      }
      setContainerHeight(entry.contentRect.height);
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (isTabsPanelCollapsed) {
      return;
    }
    if (tabsPanelHeight === effectiveTabsPanelHeight) {
      return;
    }
    setTabsPanelHeight(effectiveTabsPanelHeight);
  }, [effectiveTabsPanelHeight, isTabsPanelCollapsed, tabsPanelHeight]);

  useEffect(() => {
    return () => {
      if (resizeRafRef.current !== null) {
        cancelAnimationFrame(resizeRafRef.current);
      }
    };
  }, []);

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

  const handleTabsPanelToggle = () => {
    if (tabsPanelDisabled) {
      return;
    }
    setTabsPanelCollapsed((value) => !value);
  };

  const beginTabsPanelResizeDrag = (event: MouseEvent<HTMLDivElement>) => {
    if (tabsPanelDisabled || isTabsPanelCollapsed) {
      return;
    }
    const container = containerRef.current;
    if (!container) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    const measuredContainerHeight = container.clientHeight;
    const startY = event.clientY;
    const startHeight = effectiveTabsPanelHeight;
    let latestClientY = startY;

    const applyResizeForClientY = (clientY: number) => {
      const deltaY = startY - clientY;
      const nextHeight = applyViewModesTabsPanelResize({
        startHeight,
        deltaY,
        containerHeight: measuredContainerHeight,
      });
      setTabsPanelHeight((current) =>
        current === nextHeight ? current : nextHeight,
      );
    };

    const handleMove = (moveEvent: globalThis.MouseEvent) => {
      latestClientY = moveEvent.clientY;
      if (resizeRafRef.current !== null) {
        return;
      }
      resizeRafRef.current = requestAnimationFrame(() => {
        applyResizeForClientY(latestClientY);
        resizeRafRef.current = null;
      });
    };

    const handleUp = (upEvent: globalThis.MouseEvent) => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      if (resizeRafRef.current !== null) {
        cancelAnimationFrame(resizeRafRef.current);
        resizeRafRef.current = null;
      }
      applyResizeForClientY(upEvent.clientY);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };

  return (
    <div
      ref={containerRef}
      data-testid="view-modes-pane"
      className="group/view-modes-pane flex h-full min-h-0 w-full flex-col gap-2"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
        <div className="flex items-center gap-2">
          <button
            data-testid="view-modes-toggle-edit"
            className={`flex items-center gap-2 rounded border px-2 py-1 text-xs transition-all ${
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
            data-testid="view-modes-create-mode"
            className={`ml-auto rounded border px-2 py-1 text-xs transition-all ${
              canEditStructure
                ? "cursor-pointer border-setta-200 text-setta-700 hover:bg-setta-100 dark:border-setta-800 dark:text-setta-300 dark:hover:bg-setta-800/50"
                : "cursor-not-allowed border-setta-200 text-setta-300 opacity-60 dark:border-setta-800 dark:text-setta-600"
            }`}
            onClick={handleCreateMode}
            title="Create a new view mode"
            disabled={!canEditStructure}
          >
            New View Mode
          </button>
        </div>

        {!hasViewModes && (
          <div className="rounded border border-dashed border-setta-200 px-2 py-2 text-xs text-setta-500 dark:border-setta-800 dark:text-setta-400">
            No view modes yet. Create one to start customizing visibility.
          </div>
        )}

        <div className="flex flex-col gap-2">
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
              />
            );
          })}
        </div>
      </div>

      {!isTabsPanelCollapsed && (
        <div
          data-testid="view-modes-tabs-resize-handle"
          role="separator"
          aria-label="Resize tab preview panel"
          className="group/view-mode-resize nopan nodrag pointer-events-none -my-1 flex h-4 w-full cursor-row-resize items-center justify-center opacity-0 transition-opacity duration-150 group-focus-within/view-modes-pane:pointer-events-auto group-focus-within/view-modes-pane:opacity-100 group-hover/view-modes-pane:pointer-events-auto group-hover/view-modes-pane:opacity-100"
          onMouseDown={beginTabsPanelResizeDrag}
        >
          <div className="h-1.5 w-5 rounded-full bg-setta-400/90 transition-colors group-hover/view-mode-resize:bg-blue-500 dark:bg-setta-500 dark:group-hover/view-mode-resize:bg-blue-400" />
        </div>
      )}

      <section
        data-testid="view-modes-tabs-panel"
        className={`flex min-h-0 flex-col rounded-lg border border-setta-200 bg-white/80 dark:border-setta-800 dark:bg-setta-900/70 ${
          tabsPanelDisabled ? "opacity-60" : ""
        }`}
        style={isTabsPanelCollapsed ? undefined : { height: effectiveTabsPanelHeight }}
      >
        <button
          type="button"
          data-testid="view-modes-tabs-panel-toggle"
          className={`flex items-center justify-between gap-2 rounded-t-lg border-b border-setta-200/80 px-3 py-2 text-xs font-bold uppercase tracking-wide dark:border-setta-800/80 ${
            tabsPanelDisabled
              ? "cursor-not-allowed text-setta-400 dark:text-setta-500"
              : "cursor-pointer text-setta-600 hover:bg-setta-100/80 dark:text-setta-300 dark:hover:bg-setta-800/80"
          }`}
          onClick={handleTabsPanelToggle}
          disabled={tabsPanelDisabled}
          title={
            tabsPanelDisabled
              ? "No tab view modes are available"
              : "Toggle tab preview"
          }
        >
          <span>Tab Preview</span>
          <i
            className={`gg-chevron-down !scale-[0.6] text-setta-400 transition-transform duration-150 dark:text-setta-500 ${
              !isTabsPanelCollapsed ? "rotate-180" : ""
            }`}
          />
        </button>
        {!isTabsPanelCollapsed && (
          <ViewModeTabPreview
            tabModeList={tabModeList}
            activeViewModeId={activeViewModeId}
            onSelect={handleModeChange}
            canEditVariants={canEditVariants}
          />
        )}
      </section>
    </div>
  );
}

type ViewModeRowProps = {
  mode: ViewModeConfig;
  isActive: boolean;
  onSelect: (modeId: string) => void;
  disabled: boolean;
};

function ViewModeRow({ mode, isActive, onSelect, disabled }: ViewModeRowProps) {
  let modeLabel = mode.name;
  if (!modeLabel) {
    modeLabel = "Untitled View";
  }
  let icon = <HiCode size={18} />;
  if (mode.isUserFacing) {
    icon = <TbUser size={18} />;
  }
  const baseClasses =
    "flex items-center gap-2 rounded p-2 text-xs transition-all";
  const activeClasses = "bg-white text-blue-600 shadow-sm dark:bg-setta-800";
  const inactiveClasses =
    "text-setta-700 hover:bg-setta-100 dark:text-setta-300 dark:hover:bg-setta-800/50";
  const rowClasses = isActive
    ? `${baseClasses} ${activeClasses}`
    : `${baseClasses} ${inactiveClasses}`;
  const iconClasses = isActive
    ? "text-blue-600 dark:text-blue-400"
    : "text-setta-500 dark:text-setta-400";

  return (
    <button
      className={rowClasses}
      onClick={disabled ? undefined : () => onSelect(mode.id)}
      title={modeLabel}
      disabled={disabled}
    >
      <span className={`flex items-center justify-center ${iconClasses}`}>
        {icon}
      </span>
      <span className="truncate">{modeLabel}</span>
    </button>
  );
}

function ViewModeTabPreview({
  tabModeList,
  activeViewModeId,
  onSelect,
  canEditVariants,
}: {
  tabModeList: Array<ViewModeConfig>;
  activeViewModeId: string | null;
  onSelect: (modeId: string) => void;
  canEditVariants: boolean;
}) {
  if (tabModeList.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center px-3 py-2 text-xs text-setta-500 dark:text-setta-500">
        Mark a view mode as a tab to preview it here.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 items-end border-t border-setta-200/70 bg-setta-50/50 dark:border-setta-800/70 dark:bg-setta-925/40">
      <div className="flex w-full items-end gap-1 overflow-x-auto px-2 py-2">
        {tabModeList.map((mode) => {
          const isActive = activeViewModeId === mode.id;
          const label = mode.name ? mode.name : "Untitled View";
          let tabClasses =
            "box-border flex h-[30px] min-w-[96px] max-w-[240px] flex-[0_1_200px] select-none items-center gap-2 rounded-t-md border border-solid border-b-0 px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-light-blue-500";
          if (isActive) {
            tabClasses = `${tabClasses} border-setta-300 bg-white text-setta-900 shadow-[0_2px_10px_rgba(0,0,0,0.08)] dark:border-setta-500 dark:bg-setta-850 dark:text-setta-50 dark:shadow-[0_2px_14px_rgba(0,0,0,0.6)]`;
          } else {
            tabClasses = `${tabClasses} border-setta-300 bg-setta-100 text-setta-700 hover:bg-setta-50 hover:text-setta-900 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200 dark:hover:bg-setta-850 dark:hover:text-setta-50`;
          }
          if (!canEditVariants) {
            tabClasses = `${tabClasses} cursor-not-allowed opacity-60`;
          }

          return (
            <button
              key={mode.id}
              className={tabClasses}
              onClick={canEditVariants ? () => onSelect(mode.id) : undefined}
              title={label}
              disabled={!canEditVariants}
            >
              <span className="relative -top-px min-w-0 flex-1 truncate">
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
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
}: ViewModeEditingRowProps) {
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
          const nextViewModeId = Object.keys(viewModes)[0] ?? null;
          state.projectConfig.activeViewModeId = nextViewModeId;
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

  const baseClasses =
    "section-key-value group/viewmode flex cursor-pointer items-center gap-2 rounded border px-2 py-1 text-xs transition-colors";
  const activeClasses =
    "border-blue-500/70 bg-blue-500/10 text-setta-700 dark:text-setta-200";
  const inactiveClasses =
    "border-setta-200 text-setta-600 hover:border-setta-500/70 dark:border-setta-700 dark:text-setta-300 dark:hover:border-setta-500/70";
  const rowClasses = isActive
    ? `${baseClasses} ${activeClasses}`
    : `${baseClasses} ${inactiveClasses}`;

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
      className={`${rowClasses} ${
        canEditVariants ? "" : "cursor-not-allowed opacity-60"
      }`}
      onClick={rowClick}
    >
      <input
        value={inputValue}
        onChange={onChange}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        onClick={handleInputClick}
        placeholder="View mode name"
        className="flex-1 truncate bg-transparent text-setta-500 focus:text-setta-900 focus:outline-none focus:ring-0 dark:text-setta-400 dark:focus:text-setta-100"
        disabled={!canEditStructure}
      />
      <button
        data-testid="view-mode-toggle-tab"
        className={`cursor-pointer bg-transparent ${tabClasses}`}
        onClick={handleToggleTab}
        title={tabTitle}
        disabled={!canEditStructure}
      >
        <FiBookmark size={16} />
      </button>
      <button
        className={`cursor-pointer bg-transparent ${userFacingClasses}`}
        onClick={handleToggleUserFacing}
        title={userFacingTitle}
        disabled={!canEditStructure}
      >
        {userFacingIcon}
      </button>
      {isDeletable && (
        <button
          className="cursor-pointer bg-transparent text-transparent hover:!text-red-500 active:!text-red-700 group-hover/viewmode:text-setta-400/50"
          onClick={handleDelete}
          title="Delete view mode"
          disabled={!canEditStructure}
        >
          <i className="gg-trash" />
        </button>
      )}
    </div>
  );
}
