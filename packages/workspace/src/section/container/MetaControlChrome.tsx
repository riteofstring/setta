import { TbAdjustmentsHorizontal } from "react-icons/tb";
import { handleSectionControlEscape } from "../../controls/sectionFocus.js";
import { useWorkspaceCapabilities } from "../../document/capabilities.js";
import type { WorkspaceSection } from "../../document/types.js";
import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
  SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER,
} from "../../interaction.js";
import { useWorkspaceHost } from "../../workspaceHostContext.js";

const EDIT_TRIGGER_CLASS_NAME = `${SETTA_PREVENT_SECTION_ACTIVE_CSS} ${SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER} ${NO_DRAG_CLASS_NAME} relative flex h-6 w-6 cursor-pointer select-none items-center justify-center rounded-full p-1 me-1 -ms-0.5 aspect-square font-semibold leading-none text-setta-700 outline-none motion-safe:transition-colors motion-safe:duration-150 hover:bg-setta-100 focus:opacity-100 focus:pointer-events-auto focus-visible:ring-2 dark:text-setta-200 dark:hover:bg-setta-800 opacity-0 pointer-events-none group-hover/card-section:opacity-100 group-hover/card-section:pointer-events-auto disabled:cursor-not-allowed disabled:opacity-50 after:absolute after:end-[-0.25rem] after:top-1/2 after:h-12 after:w-10 after:-translate-y-1/2 after:content-['']`;
const EDIT_ICON_CLASS_NAME =
  "h-4 w-4 shrink-0 text-setta-300 motion-safe:transition-colors group-hover/card-section:text-blue-500 dark:text-setta-500 dark:group-hover/card-section:text-[#0084ff]";

export function MetaControlChrome({
  section,
  onEdit,
}: {
  section: WorkspaceSection;
  onEdit: (section: WorkspaceSection) => void;
}) {
  const host = useWorkspaceHost();
  const { canEditLayout, canEditStructure } = useWorkspaceCapabilities(
    (state) => state,
  );
  const showDragHandle = canEditLayout && !section.positionAndSizeLocked;

  return (
    <>
      {showDragHandle ? (
        <button
          type="button"
          className={`${NO_PAN_CLASS_NAME} absolute left-1/2 top-0 z-20 flex h-6 w-12 -translate-x-1/2 -translate-y-1/2 touch-none cursor-grab items-center justify-center rounded focus-visible:outline focus-visible:outline-2 active:cursor-grabbing`}
          aria-label={`Drag ${section.name.trim() || "meta control"}`}
          title="Drag to move"
          data-meta-control-drag-handle="true"
        >
          <div className="h-1 w-8 rounded-full bg-setta-300/70 dark:bg-setta-600/70" />
        </button>
      ) : null}
      <div className="absolute start-0 top-1/2 z-[200] -translate-y-1/2 ltr:-translate-x-full rtl:translate-x-full">
        <div className="flex h-12 w-10 items-center justify-end">
          <button
            type="button"
            className={EDIT_TRIGGER_CLASS_NAME}
            onClick={() => onEdit(section)}
            onKeyDown={(event) =>
              handleSectionControlEscape(host, event, section.id)
            }
            disabled={!canEditStructure}
            aria-label={`Edit ${section.name.trim() || "meta control"}`}
            title="Edit meta control"
            data-meta-control-edit="true"
          >
            <TbAdjustmentsHorizontal
              className={EDIT_ICON_CLASS_NAME}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>
    </>
  );
}
