import _ from "lodash";
import { useMemo } from "react";
import { useLocalStorage, useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { route_set_active_view_mode } from "utils/generatedEndpoints";

const TAB_LABEL_FALLBACK = "Untitled View";

export function ViewModeTabs() {
  const { projectConfigId, viewModes, activeViewModeId } = useProjectState(
    (x) => ({
      projectConfigId: x.projectConfig.id,
      viewModes: x.projectConfig.viewModes,
      activeViewModeId: x.projectConfig.activeViewModeId,
    }),
    _.isEqual,
  );
  const { canEditVariants } = useShareCapabilities();
  const { overviewWidth, uiEditorWidth } = useLocalStorage(
    (x) => ({
      overviewWidth: x.overviewTrueWidth,
      uiEditorWidth: x.uiEditorTrueWidth,
    }),
    _.isEqual,
  );

  const tabModes = useMemo(
    () => Object.values(viewModes).filter((mode) => mode.isTab),
    [viewModes],
  );

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
    <div className="relative z-[18] flex min-h-[36px] items-center border-b border-setta-200/80 bg-white/85 backdrop-blur dark:border-setta-800/80 dark:bg-setta-900/70">
      <div
        className="flex w-full items-center gap-1 overflow-x-auto px-2 py-1"
        style={{
          paddingLeft: overviewWidth + 8,
          paddingRight: uiEditorWidth + 8,
        }}
      >
        {tabModes.map((mode) => {
          const isActive = activeViewModeId === mode.id;
          const label = mode.name ? mode.name : TAB_LABEL_FALLBACK;
          let tabClasses =
            "flex max-w-[200px] items-center gap-2 rounded-t-md border px-3 py-1 text-xs font-semibold transition-colors";
          if (isActive) {
            tabClasses = `${tabClasses} border-setta-200 bg-white text-blue-600 shadow-sm dark:border-setta-700 dark:bg-setta-900`;
          } else {
            tabClasses = `${tabClasses} border-transparent text-setta-600 hover:bg-setta-100 hover:text-setta-800 dark:text-setta-300 dark:hover:bg-setta-800/60`;
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
              <span className="truncate">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
