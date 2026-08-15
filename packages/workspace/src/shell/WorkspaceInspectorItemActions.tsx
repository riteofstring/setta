import { useItemDndState } from "../dnd/itemDndState";
import { useWorkspaceCapabilities } from "../document/capabilities";
import { getWorkspaceItemFactory } from "../document/sectionKindRegistry";
import type { WorkspaceSection, WorkspaceSectionItemTree } from "../document/types";
import {
  deleteLastWorkspaceItem,
  deleteSelectedWorkspaceItems,
  deleteWorkspaceItems,
  insertWorkspaceItem,
} from "../items/itemAuthoringActions";

type WorkspaceInspectorItemDeleteMode = "item" | "last" | "selected";

type WorkspaceInspectorItemActionsProps = {
  deleteMode: WorkspaceInspectorItemDeleteMode;
  itemId?: string;
  onStatusChange: (message: string) => void;
  section: WorkspaceSection;
};

function formatDeletedParameterStatus(count: number): string {
  return `${count} ${count === 1 ? "parameter" : "parameters"} deleted.`;
}

function isItemDeleteUnavailable(
  deleteMode: WorkspaceInspectorItemDeleteMode,
  itemTree: WorkspaceSectionItemTree,
  itemId: string | undefined,
): boolean {
  switch (deleteMode) {
    case "last":
      return (itemTree.items[itemTree.rootId]?.children.length ?? 0) === 0;
    case "selected":
      return itemTree.selectedItemIds.length === 0;
    case "item":
      return itemId === undefined;
  }
}

function deleteInspectorItems(
  deleteMode: WorkspaceInspectorItemDeleteMode,
  sectionId: string,
  itemId: string | undefined,
): Array<string> {
  switch (deleteMode) {
    case "last":
      return deleteLastWorkspaceItem(sectionId);
    case "selected":
      return deleteSelectedWorkspaceItems(sectionId);
    case "item":
      if (!itemId) {
        throw new Error(`Section ${sectionId} item deletion requires an item id.`);
      }
      return deleteWorkspaceItems(sectionId, [itemId]);
  }
}

function getItemDeleteLabel(deleteMode: WorkspaceInspectorItemDeleteMode): string {
  switch (deleteMode) {
    case "last":
      return "Remove last parameter";
    case "selected":
      return "Delete selected parameters";
    case "item":
      return "Delete parameter";
  }
}

function MissingItemFactoryHelp({ hasFactory }: { hasFactory: boolean }) {
  if (hasFactory) {
    return null;
  }
  return (
    <p className="setta-workspace-inspector-help">
      Adding parameters requires this section kind to register an item factory.
    </p>
  );
}

export function WorkspaceInspectorItemActions({
  deleteMode,
  itemId,
  onStatusChange,
  section,
}: WorkspaceInspectorItemActionsProps) {
  const canEditStructure = useWorkspaceCapabilities((state) => state.canEditStructure);
  const itemDragActive = useItemDndState((state) => state.activeId !== null);
  const itemTree = section.itemTree;
  if (!itemTree) {
    return null;
  }
  const mutationDisabled = !canEditStructure || itemDragActive;
  const hasFactory = getWorkspaceItemFactory(section) !== null;
  const deleteDisabled = mutationDisabled || isItemDeleteUnavailable(deleteMode, itemTree, itemId);

  function deleteParameters(): void {
    const deleted = deleteInspectorItems(deleteMode, section.id, itemId);
    onStatusChange(formatDeletedParameterStatus(deleted.length));
  }

  return (
    <>
      <div
        className="setta-workspace-inspector-actions"
        data-inspector-focus-key="item-authoring-actions"
      >
        <button
          disabled={mutationDisabled || !hasFactory}
          onClick={() => {
            insertWorkspaceItem(section.id);
            onStatusChange("Parameter added.");
          }}
          type="button"
        >
          Add parameter
        </button>
        <button
          className="setta-workspace-inspector-danger-action"
          disabled={deleteDisabled}
          onClick={deleteParameters}
          type="button"
        >
          {getItemDeleteLabel(deleteMode)}
        </button>
      </div>
      <MissingItemFactoryHelp hasFactory={hasFactory} />
    </>
  );
}
