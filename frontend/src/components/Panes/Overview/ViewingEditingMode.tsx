import _ from "lodash";
import { FiEdit3 } from "react-icons/fi";
import { HiCode, HiOutlineEye } from "react-icons/hi";
import { TbUser } from "react-icons/tb";
import { useProjectState } from "state/definitions";
import { route_create_view_mode } from "utils/generatedEndpoints";

export function ViewingEditingMode() {
  const {
    projectConfigId,
    viewModeList,
    activeViewModeId,
    activeViewMode,
    isEditingViewMode,
  } = useProjectState((x) => {
    const viewModeList = Object.values(x.projectConfig.viewModes);
    const activeViewModeId = x.projectConfig.activeViewModeId;
    const activeViewMode = activeViewModeId
      ? x.projectConfig.viewModes[activeViewModeId]
      : null;
    const isEditingViewMode = x.projectConfig.isEditingViewMode;
    return {
      projectConfigId: x.projectConfig.id,
      viewModeList,
      activeViewModeId,
      activeViewMode,
      isEditingViewMode,
    };
  }, _.isEqual);
  const editLabel = isEditingViewMode ? "Editing" : "Preview";
  const editIcon = isEditingViewMode ? (
    <FiEdit3 size={16} />
  ) : (
    <HiOutlineEye size={16} />
  );
  const hasViewModes = viewModeList.length > 0;

  const handleModeChange = (modeId: string) => {
    useProjectState.setState((state) => {
      state.projectConfig.activeViewModeId = modeId;
    });
  };

  const handleToggleEdit = () => {
    useProjectState.setState((state) => {
      state.projectConfig.isEditingViewMode =
        !state.projectConfig.isEditingViewMode;
    });
  };

  const handleCreateMode = () => {
    void route_create_view_mode({ projectConfigId });
  };

  const handleToggleUserFacing = (modeId: string) => {
    useProjectState.setState((state) => {
      const viewMode = state.projectConfig.viewModes[modeId];
      if (!viewMode) {
        throw new Error(`View mode ${modeId} not found`);
      }
      viewMode.isUserFacing = !viewMode.isUserFacing;
    });
  };

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <button
          className="flex items-center gap-2 rounded border border-setta-200 px-2 py-1 text-xs text-setta-700 transition-all hover:bg-setta-100 dark:border-setta-800 dark:text-setta-300 dark:hover:bg-setta-800/50"
          onClick={handleToggleEdit}
          title="Toggle view editing"
        >
          <span className="text-setta-500 dark:text-setta-400">{editIcon}</span>
          {editLabel}
        </button>
        <button
          className="ml-auto rounded border border-setta-200 px-2 py-1 text-xs text-setta-700 transition-all hover:bg-setta-100 dark:border-setta-800 dark:text-setta-300 dark:hover:bg-setta-800/50"
          onClick={handleCreateMode}
          title="Create a new view mode"
        >
          New View Mode
        </button>
      </div>

      {activeViewMode && (
        <button
          className="flex items-center gap-2 rounded border border-setta-200 px-2 py-1 text-xs text-setta-700 transition-all hover:bg-setta-100 dark:border-setta-800 dark:text-setta-300 dark:hover:bg-setta-800/50"
          onClick={() => handleToggleUserFacing(activeViewMode.id)}
          title="Toggle whether this view is user-facing"
        >
          <span className="text-setta-500 dark:text-setta-400">
            {activeViewMode.isUserFacing ? (
              <TbUser size={16} />
            ) : (
              <HiCode size={16} />
            )}
          </span>
          {activeViewMode.isUserFacing ? "User-facing" : "Developer-facing"}
        </button>
      )}

      {!hasViewModes && (
        <div className="rounded border border-dashed border-setta-200 px-2 py-2 text-xs text-setta-500 dark:border-setta-800 dark:text-setta-400">
          No view modes yet. Create one to start customizing visibility.
        </div>
      )}

      <div className="flex flex-col gap-2">
        {viewModeList.map((mode) => {
          const isActive = activeViewModeId === mode.id;
          const modeLabel = mode.name || "Untitled View";
          const icon = mode.isUserFacing ? (
            <TbUser size={18} />
          ) : (
            <HiCode size={18} />
          );
          const baseClasses =
            "flex items-center gap-2 rounded p-2 text-xs transition-all";
          const activeClasses =
            "bg-white text-blue-600 shadow-sm dark:bg-setta-800";
          const inactiveClasses =
            "text-setta-700 hover:bg-setta-100 dark:text-setta-300 dark:hover:bg-setta-800/50";

          return (
            <button
              key={mode.id}
              className={`${baseClasses} ${isActive ? activeClasses : inactiveClasses}`}
              onClick={() => handleModeChange(mode.id)}
              title={modeLabel}
            >
              <span
                className={`flex items-center justify-center ${
                  isActive
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-setta-500 dark:text-setta-400"
                }`}
              >
                {icon}
              </span>
              <span className="truncate">{modeLabel}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
