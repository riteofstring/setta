import _ from "lodash";
import { useEffect } from "react";
import { FiCheck, FiEdit3 } from "react-icons/fi";
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
  route_toggle_view_mode_user_facing,
} from "utils/generatedEndpoints";
import { ViewModeConfig } from "utils/generatedTypes";

export function ViewingEditingMode() {
  const { projectConfigId, viewModeList, activeViewModeId, isEditingViewMode } =
    useProjectState((x) => {
      const viewModeList = Object.values(x.projectConfig.viewModes);
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

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <button
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

type ViewModeEditingRowProps = {
  mode: ViewModeConfig;
  isActive: boolean;
  isDeletable: boolean;
  projectConfigId: string;
  onSelect: (modeId: string) => void;
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
  onToggleUserFacing,
  canEditVariants,
  canEditStructure,
}: ViewModeEditingRowProps) {
  function onSetName(name: string) {
    if (!canEditStructure) {
      return;
    }
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
    });
  }

  function conditionToSetName(name: string) {
    const state = useProjectState.getState();
    for (const viewMode of Object.values(state.projectConfig.viewModes)) {
      if (viewMode.id !== mode.id && viewMode.name === name) {
        return false;
      }
    }
    return true;
  }

  const { inputValue, onChange, onBlur, onKeyDown } = useEditableOnSubmit(
    mode.name,
    onSetName,
    conditionToSetName,
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
