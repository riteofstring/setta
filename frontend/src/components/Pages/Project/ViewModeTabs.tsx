import _ from "lodash";
import { HiOutlineBars3 } from "react-icons/hi2";
import { persistViewModeSortOrder } from "state/actions/viewModes";
import { useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { route_set_active_view_mode } from "utils/generatedEndpoints";
import { reorderViewModeIdList, sortViewModes } from "utils/viewModeOrdering";
import {
  useViewModeSortableItem,
  ViewModeSortableProvider,
} from "./ViewModeDnd";

const TAB_LABEL_FALLBACK = "Untitled View";
const VIEW_MODE_DRAG_MIME = "application/x-setta-view-mode-id";

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
      tabModes: sortViewModes(Object.values(x.projectConfig.viewModes))
        .filter((mode) => mode.isTab)
        .map((mode) => ({ id: mode.id, name: mode.name })),
      orderedViewModeIds: sortViewModes(Object.values(x.projectConfig.viewModes))
        .map((mode) => mode.id),
      tabSlotIndices: sortViewModes(Object.values(x.projectConfig.viewModes))
        .flatMap((mode, index) => (mode.isTab ? [index] : [])),
    }),
    _.isEqual,
  );
  const { canEditVariants, canEditStructure } = useShareCapabilities();

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

  const handleReorder = (activeId: string, overId: string) => {
    if (!canEditStructure) {
      return;
    }
    const currentTabIds = tabModes.map((mode) => mode.id);
    const reorderedTabIds = reorderViewModeIdList(currentTabIds, activeId, overId);
    if (reorderedTabIds === currentTabIds) {
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
                canEditStructure={canEditStructure}
                onSelect={handleSelect}
                onNativeReorder={handleReorder}
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
  canEditStructure,
  onSelect,
  onNativeReorder,
}: {
  modeId: string;
  modeName: string;
  isActive: boolean;
  canEditVariants: boolean;
  canEditStructure: boolean;
  onSelect: (modeId: string) => void;
  onNativeReorder: (activeId: string, overId: string) => void;
}) {
  const sortable = useViewModeSortableItem(modeId, !canEditStructure);
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
  } else if (canEditStructure) {
    tabClasses = `${tabClasses} cursor-grab active:cursor-grabbing`;
  }

  return (
    <button
      ref={sortable.setNodeRef}
      data-testid="view-mode-tab-button"
      data-view-mode-id={modeId}
      className={tabClasses}
      style={sortable.style}
      draggable={canEditStructure}
      onDragStart={(event) => {
        if (!canEditStructure) {
          return;
        }
        event.dataTransfer.setData(VIEW_MODE_DRAG_MIME, modeId);
        event.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(event) => {
        if (!canEditStructure) {
          return;
        }
        event.preventDefault();
      }}
      onDrop={(event) => {
        if (!canEditStructure) {
          return;
        }
        event.preventDefault();
        const draggedId = event.dataTransfer.getData(VIEW_MODE_DRAG_MIME);
        if (!draggedId || draggedId === modeId) {
          return;
        }
        onNativeReorder(draggedId, modeId);
      }}
      {...sortable.attributes}
      {...sortable.listeners}
      onClick={canEditVariants ? () => onSelect(modeId) : undefined}
      title={label}
      disabled={!canEditVariants}
    >
      {canEditStructure && (
        <HiOutlineBars3 className="h-3.5 w-3.5 shrink-0 text-setta-400 dark:text-setta-500" />
      )}
      <span className="relative -top-px min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}
