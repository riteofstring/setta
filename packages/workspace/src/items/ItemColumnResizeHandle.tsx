import { useWorkspaceCapabilities } from "../document/capabilities";
import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  SETTA_PREVENT_ARROW_KEYS_MOVING_SECTION,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
} from "../interaction";
import { useItemListContext } from "./ItemListContext";

export function ItemColumnResizeHandle() {
  const canEditLayout = useWorkspaceCapabilities(
    (state) => state.canEditLayout,
  );
  const { onColumnResizeDoubleClick, onColumnResizeStart } =
    useItemListContext();
  if (!canEditLayout) {
    return null;
  }
  return (
    <div className="section-center relative mx-auto h-[90%] w-0.5 rounded-sm group-hover/arg-group:bg-setta-500/15">
      <button
        type="button"
        aria-label="Resize item columns"
        className={`${SETTA_PREVENT_SECTION_ACTIVE_CSS} ${SETTA_PREVENT_ARROW_KEYS_MOVING_SECTION} ${NO_PAN_CLASS_NAME} ${NO_DRAG_CLASS_NAME} group/resize absolute inset-y-0 left-1/2 -ml-2 flex w-4 touch-none cursor-col-resize items-center justify-center`}
        data-item-column-resize-handle="true"
        tabIndex={-1}
        onPointerDown={onColumnResizeStart}
        onDoubleClick={onColumnResizeDoubleClick}
      >
        <div className="h-[calc(100%-4px)] w-1.5 rounded bg-transparent hover:!bg-blue-500 group-hover/resize:bg-setta-200 group-hover/resize:dark:bg-setta-500" />
      </button>
    </div>
  );
}
