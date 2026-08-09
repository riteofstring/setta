import { TbAdjustmentsHorizontal } from "react-icons/tb";
import { useWorkspaceCapabilities } from "../../document/capabilities";
import type { WorkspaceSection } from "../../document/types";
import {
  NO_DRAG_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
  SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER,
} from "../../interaction";

// The developer-approved correction gives the shared meta action a conventional 16 px glyph in a
// compact 24 px visible button. Its outboard 40 x 48 hit geometry remains unchanged, so increasing
// the paint does not move the control or create a competing drag target.
const EDIT_TRIGGER_CLASS_NAME = `${SETTA_PREVENT_SECTION_ACTIVE_CSS} ${SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER} ${NO_DRAG_CLASS_NAME} relative flex h-6 w-6 cursor-pointer select-none items-center justify-center rounded-full p-1 mr-1 -ml-0.5 aspect-square font-semibold leading-none text-setta-700 outline-none transition-colors duration-150 hover:bg-setta-100 focus:opacity-100 focus:pointer-events-auto focus-visible:ring-2 dark:text-setta-200 dark:hover:bg-setta-800 opacity-0 pointer-events-none group-hover/card-section:opacity-100 group-hover/card-section:pointer-events-auto disabled:cursor-not-allowed disabled:opacity-50 after:absolute after:right-[-0.25rem] after:top-1/2 after:h-12 after:w-10 after:-translate-y-1/2 after:content-['']`;
const EDIT_ICON_CLASS_NAME =
  "h-4 w-4 shrink-0 text-setta-300 transition-colors group-hover/card-section:text-blue-500 dark:text-setta-500 dark:group-hover/card-section:text-[#0084ff]";

export function MetaControlChrome({
  section,
  onEdit,
}: {
  section: WorkspaceSection;
  onEdit: (section: WorkspaceSection) => void;
}) {
  const { canEditLayout, canEditStructure } = useWorkspaceCapabilities();
  const showDragHandle = canEditLayout && !section.positionAndSizeLocked;

  return (
    <>
      {showDragHandle ? (
        <div
          className="pointer-events-none absolute left-1/2 top-0 z-20 flex h-3 w-12 -translate-x-1/2 -translate-y-1/2 cursor-move items-center justify-center opacity-0 transition-opacity group-hover/card-section:pointer-events-auto group-hover/card-section:opacity-100"
          aria-hidden="true"
          data-meta-control-drag-handle="true"
        >
          <div className="h-1 w-8 rounded-full bg-setta-300/70 dark:bg-setta-600/70" />
        </div>
      ) : null}
      <div className="absolute left-0 top-1/2 z-[200] -translate-x-full -translate-y-1/2">
        <div className="flex h-12 w-10 items-center justify-end">
          <button
            type="button"
            className={EDIT_TRIGGER_CLASS_NAME}
            onClick={() => onEdit(section)}
            disabled={!canEditStructure}
            aria-label={`Edit ${section.name.trim() || "meta control"}`}
            title="Edit meta control"
            data-meta-control-edit="true"
          >
            <TbAdjustmentsHorizontal className={EDIT_ICON_CLASS_NAME} aria-hidden="true" />
          </button>
        </div>
      </div>
    </>
  );
}
