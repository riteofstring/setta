import _ from "lodash";
import { useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { route_set_active_view_mode } from "utils/generatedEndpoints";
import { sortViewModes } from "utils/viewModeOrdering";

const TAB_LABEL_FALLBACK = "Untitled View";

export function ViewModeTabs() {
  const { projectConfigId, tabModes, activeViewModeId } = useProjectState(
    (x) => ({
      projectConfigId: x.projectConfig.id,
      activeViewModeId: x.projectConfig.activeViewModeId,
      tabModes: sortViewModes(
        Object.values(x.projectConfig.viewModes).filter((mode) => mode.isTab),
      ).map((mode) => ({ id: mode.id, name: mode.name })),
    }),
    _.isEqual,
  );
  const { canEditVariants } = useShareCapabilities();

  if (tabModes.length === 0) {
    return null;
  }

  const handleSelect = (modeId: string) => {
    if (!canEditVariants || modeId === activeViewModeId) {
      return;
    }
    void route_set_active_view_mode({
      projectConfigId,
      activeViewModeId: modeId,
    });
  };

  return (
    <div
      data-testid="view-mode-tabs-bar"
      className="relative z-[18] col-start-1 col-end-2 row-start-3 row-end-4 flex h-9 min-h-9 items-end border-t border-setta-200/75 bg-white dark:border-setta-850 dark:bg-setta-925"
    >
      <div className="flex w-full items-end gap-1 overflow-x-auto px-2">
        {tabModes.map((mode) => {
          const isActive = activeViewModeId === mode.id;
          const label = mode.name ? mode.name : TAB_LABEL_FALLBACK;
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
              onClick={
                canEditVariants ? () => handleSelect(mode.id) : undefined
              }
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
