import { useItemDndState } from "../dnd/itemDndState";
import { useWorkspaceCapabilities } from "../document/capabilities";
import {
  getSectionItemTreeOrThrow,
  getSectionOrThrow,
} from "../document/documentSelectors";
import {
  getWorkspaceItemFactory,
  type WorkspaceItemToolbarMode,
} from "../document/sectionKindRegistry";
import { useWorkspaceDocument } from "../document/stores";
import {
  deleteLastWorkspaceItem,
  deleteSelectedWorkspaceItems,
  insertWorkspaceItem,
} from "./itemAuthoringActions";
import { useWorkspaceItemFilter } from "./WorkspaceItemFilterContext";
import { WorkspaceItemFilterControls } from "./WorkspaceItemFilterControls";
import { useWorkspaceHost } from "../workspaceHostContext";
import type { MouseEvent } from "react";

function getItemAuthoringToneClasses(hasSectionStyleTheme: boolean): {
  button: string;
  container: string;
  mutedText: string;
} {
  if (hasSectionStyleTheme) {
    return {
      button:
        "text-[color:var(--setta-section-style-muted-text)] hover:text-[color:var(--setta-section-style-outline)] focus-visible:ring-[var(--setta-section-style-outline)]",
      container:
        "border-[color:var(--setta-section-style-border)] bg-[color:var(--setta-section-style-bg)]",
      mutedText: "text-[color:var(--setta-section-style-muted-text)]",
    };
  }
  return {
    button:
      "text-setta-500 hover:text-blue-500 focus-visible:ring-blue-500/70 dark:hover:text-blue-500",
    container: "border-white dark:border-setta-700",
    mutedText: "text-setta-600/70 dark:text-setta-400/30",
  };
}

function isItemAuthoringMutationDisabled(
  canEditStructure: boolean,
  itemDragActive: boolean,
  sectionLocked: boolean,
): boolean {
  return !canEditStructure || itemDragActive || sectionLocked;
}

// An inline CodeMirror editor replaces itself with its idle layer after blur. Letting a toolbar
// mouse press take focus can therefore replace the layout under that same click before its release
// arrives. Structural actions preserve the active editor through the pointer gesture; keyboard
// activation still uses the button's normal focus behavior.
function preserveInlineEditorDuringAuthoringPress(
  event: MouseEvent<HTMLButtonElement>,
): void {
  event.preventDefault();
}

// The registered item-area presentation selects which of these exact behaviors renders. The
// `hidden` mode renders no toolbar at all, so it never reaches this component; the two visible
// modes share one filter surface and one mutation implementation.
//
// `followsLeadingContent` is the item area's own composition input rather than a declared toolbar
// mode: the reference gives a toolbar composed under a section's leading control `mt-0 pb-0` and
// every other item toolbar `mt-1 pb-1`.
export function WorkspaceItemToolbar({
  followsLeadingContent,
  mode,
  sectionId,
}: {
  followsLeadingContent: boolean;
  mode: Exclude<WorkspaceItemToolbarMode, "hidden">;
  sectionId: string;
}) {
  const hasSectionStyleTheme =
    useWorkspaceItemFilter()?.hasSectionStyleTheme === true;
  const toneClasses = getItemAuthoringToneClasses(hasSectionStyleTheme);
  const spacingClasses = followsLeadingContent ? "mt-0 pb-0" : "mt-1 pb-1";

  return (
    <div
      className={`setta-workspace-item-toolbar section-args z-10 flex min-w-0 shrink-0 flex-wrap overflow-hidden rounded-xl border-b border-solid px-1 shadow-sm isolate ${spacingClasses} ${toneClasses.container}`}
      data-tab-native="true"
      data-workspace-item-toolbar={mode}
    >
      <div className="ms-1 flex items-center gap-1">
        <span
          className={`setta-workspace-item-toolbar-label my-auto ms-2 me-[.1rem] text-xs font-bold uppercase tracking-tighter ${toneClasses.mutedText}`}
        >
          Args
        </span>
        {mode === "authoring-and-filter" ? (
          <WorkspaceItemAuthoringActions
            buttonClassName={`nodrag inline-flex h-[18px] w-[18px] cursor-pointer items-center justify-center rounded-full bg-transparent focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${toneClasses.button}`}
            sectionId={sectionId}
          />
        ) : null}
      </div>
      <WorkspaceItemFilterControls sectionId={sectionId} />
    </div>
  );
}

function WorkspaceItemAuthoringActions({
  buttonClassName,
  sectionId,
}: {
  buttonClassName: string;
  sectionId: string;
}) {
  const host = useWorkspaceHost();
  const canEditStructure = useWorkspaceCapabilities(
    (state) => state.canEditStructure,
  );
  const itemDragActive = useItemDndState((state) => state.activeId !== null);
  const state = useWorkspaceDocument((documentState) => {
    const section = getSectionOrThrow(documentState, sectionId);
    const itemTree = getSectionItemTreeOrThrow(documentState, sectionId);
    return {
      canCreateItem: getWorkspaceItemFactory(host, section) !== null,
      hasSelectedItems: itemTree.selectedItemIds.length > 0,
      hasTopLevelItems:
        (itemTree.items[itemTree.rootId]?.children.length ?? 0) > 0,
      sectionLocked: section.positionAndSizeLocked,
    };
  });
  const mutationDisabled = isItemAuthoringMutationDisabled(
    canEditStructure,
    itemDragActive,
    state.sectionLocked,
  );

  return (
    <>
      <button
        aria-label="Remove last parameter"
        className={buttonClassName}
        data-setta-workspace-touch-target="compact"
        disabled={mutationDisabled || !state.hasTopLevelItems}
        onClick={() => deleteLastWorkspaceItem(host, sectionId)}
        onMouseDown={preserveInlineEditorDuringAuthoringPress}
        title="Remove last parameter"
        type="button"
      >
        <i aria-hidden={true} className="gg-math-minus before:!start-0" />
      </button>
      <button
        aria-label="Add parameter"
        className={buttonClassName}
        data-setta-workspace-touch-target="compact"
        disabled={mutationDisabled || !state.canCreateItem}
        onClick={() => insertWorkspaceItem(host, sectionId)}
        onMouseDown={preserveInlineEditorDuringAuthoringPress}
        title={
          state.canCreateItem ? "Add parameter" : "Add parameter unavailable"
        }
        type="button"
      >
        <i aria-hidden={true} className="gg-math-plus !scale-50" />
      </button>
      <button
        aria-label="Delete selected parameters"
        className={buttonClassName}
        data-setta-workspace-touch-target="compact"
        disabled={mutationDisabled || !state.hasSelectedItems}
        onClick={() => deleteSelectedWorkspaceItems(host, sectionId)}
        onMouseDown={preserveInlineEditorDuringAuthoringPress}
        title="Delete selected parameters"
        type="button"
      >
        <i aria-hidden={true} className="gg-close !scale-50" />
      </button>
    </>
  );
}
