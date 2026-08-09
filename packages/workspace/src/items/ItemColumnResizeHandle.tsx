import { useWorkspaceCapabilities } from "../document/capabilities";
import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  SETTA_PREVENT_ARROW_KEYS_MOVING_SECTION,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
} from "../interaction";
import { useItemListContext } from "./ItemListContext";

// Frozen main's shared parameter-column divider in item terms: the restrained center paint is
// separate from the 16 px drag target, so package ownership does not visibly inflate the accepted
// row chrome. Layout capability gating matches the reference's share-capability check.
export function ItemColumnResizeHandle({ itemId }: { itemId: string }) {
  const canEditLayout = useWorkspaceCapabilities((state) => state.canEditLayout);
  const {
    keyboardColumnResizeItemId,
    onColumnResizeClick,
    onColumnResizeKeyDown,
    onColumnResizeStart,
  } = useItemListContext();
  if (!canEditLayout) {
    return null;
  }
  return (
    <div className="section-center relative mx-auto h-[90%] w-0.5 rounded-sm group-hover/arg-group:bg-setta-500/15">
      <button
        type="button"
        className={`${SETTA_PREVENT_SECTION_ACTIVE_CSS} ${SETTA_PREVENT_ARROW_KEYS_MOVING_SECTION} ${NO_PAN_CLASS_NAME} ${NO_DRAG_CLASS_NAME} group/resize absolute inset-y-0 left-1/2 -ml-2 flex w-4 touch-none cursor-col-resize items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1`}
        data-item-column-resize-handle="true"
        onPointerDown={onColumnResizeStart}
        onKeyDown={onColumnResizeKeyDown}
        onClick={onColumnResizeClick}
        aria-label="Resize item columns; activate to reset"
        tabIndex={keyboardColumnResizeItemId === itemId ? 0 : -1}
      >
        <div className="h-[calc(100%-4px)] w-1.5 rounded bg-transparent hover:!bg-blue-500 group-hover/resize:bg-setta-200 group-hover/resize:dark:bg-setta-500" />
      </button>
    </div>
  );
}
