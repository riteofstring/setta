import { FiPlus } from "react-icons/fi";
import { useItemDndState } from "../dnd/itemDndState";
import { useWorkspaceCapabilities } from "../document/capabilities";
import { getSectionItemTreeOrThrow, getSectionOrThrow } from "../document/documentSelectors";
import { getWorkspaceItemFactory } from "../document/sectionKindRegistry";
import { useWorkspaceDocument } from "../document/stores";
import {
  deleteLastWorkspaceItem,
  deleteSelectedWorkspaceItems,
  insertWorkspaceItem,
} from "./itemAuthoringActions";
import { WorkspaceItemFilterControls } from "./WorkspaceItemFilterControls";

export function WorkspaceItemAuthoringToolbar({ sectionId }: { sectionId: string }) {
  const canEditStructure = useWorkspaceCapabilities((state) => state.canEditStructure);
  const itemDragActive = useItemDndState((state) => state.activeId !== null);
  const state = useWorkspaceDocument((documentState) => {
    const section = getSectionOrThrow(documentState, sectionId);
    const itemTree = getSectionItemTreeOrThrow(documentState, sectionId);
    return {
      canCreateItem: getWorkspaceItemFactory(section) !== null,
      hasSelectedItems: itemTree.selectedItemIds.length > 0,
      hasTopLevelItems: (itemTree.items[itemTree.rootId]?.children.length ?? 0) > 0,
    };
  });
  const mutationDisabled = !canEditStructure || itemDragActive;
  const buttonClassName =
    "nodrag inline-flex h-[18px] w-[18px] cursor-pointer items-center justify-center rounded-full bg-transparent text-setta-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70 hover:text-setta-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-setta-400 dark:hover:text-setta-200";

  return (
    <div className="section-args flex shrink-0 flex-col px-2 pt-1">
      <div className="flex min-h-[22px] items-center gap-0.5">
        <span className="me-1 text-[10px] font-bold uppercase tracking-tight text-setta-500 dark:text-setta-400">
          Parameters
        </span>
        <button
          aria-label="Remove last parameter"
          className={buttonClassName}
          data-setta-workspace-touch-target="compact"
          disabled={mutationDisabled || !state.hasTopLevelItems}
          onClick={() => deleteLastWorkspaceItem(sectionId)}
          title="Remove last parameter"
          type="button"
        >
          <i aria-hidden={true} className="gg-math-minus !scale-50" />
        </button>
        <button
          aria-label="Add parameter"
          className={buttonClassName}
          data-setta-workspace-touch-target="compact"
          disabled={mutationDisabled || !state.canCreateItem}
          onClick={() => insertWorkspaceItem(sectionId)}
          title={state.canCreateItem ? "Add parameter" : "Add parameter unavailable"}
          type="button"
        >
          <FiPlus aria-hidden={true} className="h-3 w-3" focusable="false" />
        </button>
        <button
          aria-label="Delete selected parameters"
          className={buttonClassName}
          data-setta-workspace-touch-target="compact"
          disabled={mutationDisabled || !state.hasSelectedItems}
          onClick={() => deleteSelectedWorkspaceItems(sectionId)}
          title="Delete selected parameters"
          type="button"
        >
          <i aria-hidden={true} className="gg-close !scale-50" />
        </button>
      </div>
      <WorkspaceItemFilterControls sectionId={sectionId} />
    </div>
  );
}
