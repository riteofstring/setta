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
import { useWorkspaceItemFilter } from "./WorkspaceItemFilterContext";
import { WorkspaceItemFilterControls } from "./WorkspaceItemFilterControls";

function getItemAuthoringToneClasses(hasSectionStyleTheme: boolean): {
  button: string;
  mutedText: string;
} {
  if (hasSectionStyleTheme) {
    return {
      button:
        "text-[color:var(--setta-section-style-muted-text)] hover:text-[color:var(--setta-section-style-outline)] focus-visible:ring-[var(--setta-section-style-outline)]",
      mutedText: "text-[color:var(--setta-section-style-muted-text)]",
    };
  }
  return {
    button:
      "text-setta-500 hover:text-setta-700 focus-visible:ring-blue-500/70 dark:text-setta-400 dark:hover:text-setta-200",
    mutedText: "text-setta-500 dark:text-setta-400",
  };
}

function isItemAuthoringMutationDisabled(
  canEditStructure: boolean,
  itemDragActive: boolean,
  sectionLocked: boolean,
): boolean {
  return !canEditStructure || itemDragActive || sectionLocked;
}

export function WorkspaceItemAuthoringToolbar({ sectionId }: { sectionId: string }) {
  const canEditStructure = useWorkspaceCapabilities((state) => state.canEditStructure);
  const itemDragActive = useItemDndState((state) => state.activeId !== null);
  const hasSectionStyleTheme = useWorkspaceItemFilter()?.hasSectionStyleTheme === true;
  const state = useWorkspaceDocument((documentState) => {
    const section = getSectionOrThrow(documentState, sectionId);
    const itemTree = getSectionItemTreeOrThrow(documentState, sectionId);
    return {
      canCreateItem: getWorkspaceItemFactory(section) !== null,
      hasSelectedItems: itemTree.selectedItemIds.length > 0,
      hasTopLevelItems: (itemTree.items[itemTree.rootId]?.children.length ?? 0) > 0,
      sectionLocked: section.positionAndSizeLocked,
    };
  });
  const mutationDisabled = isItemAuthoringMutationDisabled(
    canEditStructure,
    itemDragActive,
    state.sectionLocked,
  );
  const toneClasses = getItemAuthoringToneClasses(hasSectionStyleTheme);
  const buttonClassName = `nodrag inline-flex h-[18px] w-[18px] cursor-pointer items-center justify-center rounded-full bg-transparent focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${toneClasses.button}`;

  return (
    <div className="section-args flex shrink-0 flex-col px-2 pt-1" data-tab-native="true">
      <div className="flex min-h-[22px] items-center gap-0.5">
        <span
          className={`me-1 text-[10px] font-bold uppercase tracking-tight ${toneClasses.mutedText}`}
        >
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
