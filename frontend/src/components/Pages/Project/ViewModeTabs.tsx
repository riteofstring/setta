import { callOpenAPI } from "@setta/app-subsystem-frontend-sdk";
import _ from "lodash";
import { setActiveViewMode } from "openapi/http";
import { RxDragHandleDots2 } from "react-icons/rx";
import { persistViewModeSortOrder } from "state/actions/viewModes";
import { useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { sortViewModes } from "utils/viewModeOrdering";
import {
  useViewModeSortableItem,
  ViewModeSortableProvider,
} from "./ViewModeDnd";
const TAB_LABEL_FALLBACK = "Untitled View";
export function ViewModeTabs() {
  const {
    projectConfigId,
    tabModes,
    activeViewModeId,
    orderedViewModeIds,
    tabSlotIndices,
  } = useProjectState(
    (x) => ({
      projectConfigId: x.projectConfig.id,
      activeViewModeId: x.projectConfig.activeViewModeId,
      ...(() => {
        const sortedModes = sortViewModes(
          Object.values(x.projectConfig.viewModes),
        );
        const tabModes: Array<{
          id: string;
          name: string;
        }> = [];
        const tabSlotIndices: Array<number> = [];
        for (let index = 0; index < sortedModes.length; index += 1) {
          const mode = sortedModes[index];
          if (!mode) {
            continue;
          }
          if (mode.isTab) {
            tabModes.push({ id: mode.id, name: mode.name });
            tabSlotIndices.push(index);
          }
        }
        return {
          tabModes,
          orderedViewModeIds: sortedModes.map((mode) => mode.id),
          tabSlotIndices,
        };
      })(),
    }),
    _.isEqual,
  );
  const { canEditVariants, canEditStructure } = useShareCapabilities();
  const sortableEnabled = canEditStructure && tabModes.length > 1;
  if (tabModes.length === 0) {
    return null;
  }
  const handleSelect = (modeId: string) => {
    if (!canEditVariants || modeId === activeViewModeId) {
      return;
    }
    void callOpenAPI(
      setActiveViewMode({
        body: {
          projectConfigId,
          activeViewModeId: modeId,
        },
      } as Parameters<typeof setActiveViewMode>[0]),
    );
  };
  const handleReorder = (reorderedTabIds: Array<string>) => {
    if (!sortableEnabled) {
      return;
    }
    const currentTabIds = tabModes.map((mode) => mode.id);
    if (
      reorderedTabIds.length !== currentTabIds.length ||
      reorderedTabIds.every((id, idx) => id === currentTabIds[idx])
    ) {
      return;
    }
    const nextOrderedIds = [...orderedViewModeIds];
    tabSlotIndices.forEach((slotIndex, reorderIndex) => {
      const nextTabId = reorderedTabIds[reorderIndex];
      if (!nextTabId) {
        return;
      }
      nextOrderedIds[slotIndex] = nextTabId;
    });
    persistViewModeSortOrder(projectConfigId, nextOrderedIds);
  };
  return (
    <div
      data-testid="view-mode-tabs-bar"
      className="relative z-[18] col-start-1 col-end-2 row-start-3 row-end-4 flex h-9 min-h-9 items-end border-t border-setta-200/75 bg-white dark:border-setta-850 dark:bg-setta-925"
    >
      <ViewModeSortableProvider
        id="view-mode-tabs-sortable"
        items={tabModes.map((mode) => mode.id)}
        direction="horizontal"
        enabled={sortableEnabled}
        onReorder={handleReorder}
      >
        <div
          className="flex w-full items-end gap-1 overflow-x-auto px-2"
          data-testid="view-mode-tabs-list"
        >
          {tabModes.map((mode) => {
            return (
              <ViewModeTabButton
                key={mode.id}
                modeId={mode.id}
                modeName={mode.name}
                isActive={activeViewModeId === mode.id}
                canEditVariants={canEditVariants}
                sortableEnabled={sortableEnabled}
                onSelect={handleSelect}
              />
            );
          })}
        </div>
      </ViewModeSortableProvider>
    </div>
  );
}
function ViewModeTabButton({
  modeId,
  modeName,
  isActive,
  canEditVariants,
  sortableEnabled,
  onSelect,
}: {
  modeId: string;
  modeName: string;
  isActive: boolean;
  canEditVariants: boolean;
  sortableEnabled: boolean;
  onSelect: (modeId: string) => void;
}) {
  const sortable = useViewModeSortableItem(
    modeId,
    !sortableEnabled,
    "horizontal",
  );
  const label = modeName ? modeName : TAB_LABEL_FALLBACK;
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
      ref={sortable.setNodeRef}
      data-testid="view-mode-tab-button"
      data-view-mode-id={modeId}
      aria-label={label}
      className={tabClasses}
      style={sortable.style}
      onClick={canEditVariants ? () => onSelect(modeId) : undefined}
      title={label}
      disabled={!canEditVariants}
    >
      {sortableEnabled && (
        <span
          ref={sortable.setActivatorNodeRef}
          data-testid="view-mode-tab-drag-handle"
          className="inline-flex h-3.5 w-3.5 cursor-grab touch-none text-setta-400 active:cursor-grabbing dark:text-setta-500"
          title="Reorder view mode tab"
          aria-label="Reorder view mode tab"
          {...sortable.attributes}
          {...sortable.listeners}
          onClick={(event) => event.stopPropagation()}
        >
          <RxDragHandleDots2 className="h-3.5 w-3.5" />
        </span>
      )}
      <span className="relative -top-px min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}
