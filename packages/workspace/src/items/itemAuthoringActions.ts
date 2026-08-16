import { useItemDndState } from "../dnd/itemDndState";
import { useWorkspaceCapabilities } from "../document/capabilities";
import { notifyWorkspaceDocumentChange } from "../document/documentChangeCallback";
import {
  getSectionItemTreeOrThrow,
  getSectionOrThrow,
} from "../document/documentSelectors";
import {
  prepareWorkspaceItemDeletion,
  prepareWorkspaceItemInsertion,
} from "../document/itemAuthoring";
import { getItemOrThrow } from "../document/itemTree";
import { createWorkspaceItemFromFactory } from "../document/sectionKindRegistry";
import {
  runWithAtomicallyPublishedWorkspaceStores,
  useActiveSections,
  useNodeInternals,
  useWorkspaceDocument,
} from "../document/stores";
import type {
  WorkspaceItem,
  WorkspaceSection,
  WorkspaceSectionItemTree,
} from "../document/types";
import { useSectionRefs } from "../section/sectionRefs";

type ItemAuthoringFocusPlan = { sectionId: string };

function captureItemAuthoringFocusPlan(
  sectionId: string,
): ItemAuthoringFocusPlan | null {
  if (
    typeof document === "undefined" ||
    !(document.activeElement instanceof HTMLElement)
  ) {
    return null;
  }
  const refs = useSectionRefs.getState();
  const section = refs.selfOnly[sectionId] ?? refs.withNested[sectionId];
  return section?.contains(document.activeElement) ? { sectionId } : null;
}

function getItemRowFocusTarget(
  section: HTMLElement,
  itemId: string,
): HTMLElement | null {
  return (
    [...section.querySelectorAll<HTMLElement>("[data-workspace-item-id]")].find(
      (element) => element.dataset["workspaceItemId"] === itemId,
    ) ?? null
  );
}

function restoreItemAuthoringFocus(
  plan: ItemAuthoringFocusPlan | null,
  itemId: string | null,
): void {
  if (!plan) {
    return;
  }
  requestAnimationFrame(() => {
    const refs = useSectionRefs.getState();
    const section =
      refs.selfOnly[plan.sectionId] ?? refs.withNested[plan.sectionId];
    if (!section) {
      throw new Error(
        `Cannot restore focus in section ${plan.sectionId} after item authoring.`,
      );
    }
    const itemTarget = itemId ? getItemRowFocusTarget(section, itemId) : null;
    itemTarget?.focus({ preventScroll: true });
    if (itemTarget) {
      return;
    }
    section.focus({ preventScroll: true });
  });
}

function assertItemAuthoringAvailable(section: WorkspaceSection): void {
  if (!useWorkspaceCapabilities.getState().canEditStructure) {
    throw new Error(
      "Item authoring requires permission to edit workspace structure.",
    );
  }
  if (section.positionAndSizeLocked) {
    throw new Error(
      `Section ${section.id} is locked and cannot author parameters.`,
    );
  }
  if (useItemDndState.getState().activeId !== null) {
    throw new Error(
      "Item authoring is unavailable while an item drag is active.",
    );
  }
}

function commitItemTree(
  sectionId: string,
  itemTree: WorkspaceSectionItemTree,
  focusTargetId: string | null,
  focusPlan: ItemAuthoringFocusPlan | null,
): void {
  const currentDocument = useWorkspaceDocument.getState();
  const section = getSectionOrThrow(currentDocument, sectionId);
  const nextDocument = {
    ...currentDocument,
    sections: {
      ...currentDocument.sections,
      [sectionId]: { ...section, itemTree },
    },
  };
  const nodeInternals = useNodeInternals.getState();
  const activeSections = { activeIds: [sectionId] };
  runWithAtomicallyPublishedWorkspaceStores(
    { document: nextDocument, nodeInternals, activeSections },
    () => {
      useWorkspaceDocument.setState(nextDocument);
      useActiveSections.setState(activeSections);
    },
  );
  notifyWorkspaceDocumentChange();
  restoreItemAuthoringFocus(focusPlan, focusTargetId);
}

// The only insertion funnel used by package controls and direct host invocation. The factory
// executes after capability/lock/drag gates and before any canonical store publication.
export function insertWorkspaceItem(sectionId: string): WorkspaceItem {
  const documentState = useWorkspaceDocument.getState();
  const section = getSectionOrThrow(documentState, sectionId);
  assertItemAuthoringAvailable(section);
  const itemTree = getSectionItemTreeOrThrow(documentState, sectionId);
  const item = createWorkspaceItemFromFactory(section);
  const prepared = prepareWorkspaceItemInsertion(sectionId, itemTree, item);
  const focusPlan = captureItemAuthoringFocusPlan(sectionId);
  commitItemTree(
    sectionId,
    prepared.itemTree,
    prepared.focusTargetId,
    focusPlan,
  );
  return structuredClone(
    getItemOrThrow(prepared.itemTree, prepared.insertedItemId),
  );
}

// All deletion surfaces validate the complete request before one atomic publication and one
// host notification. An empty request is a true no-op.
export function deleteWorkspaceItems(
  sectionId: string,
  itemIds: ReadonlyArray<string>,
): Array<string> {
  const documentState = useWorkspaceDocument.getState();
  const itemTree = getSectionItemTreeOrThrow(documentState, sectionId);
  if (itemIds.length === 0) {
    return [];
  }
  const section = getSectionOrThrow(documentState, sectionId);
  assertItemAuthoringAvailable(section);
  const prepared = prepareWorkspaceItemDeletion(sectionId, itemTree, itemIds);
  const focusPlan = captureItemAuthoringFocusPlan(sectionId);
  commitItemTree(
    sectionId,
    prepared.itemTree,
    prepared.focusTargetId,
    focusPlan,
  );
  return prepared.deletedItemIds;
}

export function deleteLastWorkspaceItem(sectionId: string): Array<string> {
  const itemTree = getSectionItemTreeOrThrow(
    useWorkspaceDocument.getState(),
    sectionId,
  );
  const lastItemId = itemTree.items[itemTree.rootId]?.children.at(-1);
  if (!lastItemId) {
    throw new Error(`Section ${sectionId} has no top-level item to remove.`);
  }
  return deleteWorkspaceItems(sectionId, [lastItemId]);
}

export function deleteSelectedWorkspaceItems(sectionId: string): Array<string> {
  const itemTree = getSectionItemTreeOrThrow(
    useWorkspaceDocument.getState(),
    sectionId,
  );
  return deleteWorkspaceItems(sectionId, itemTree.selectedItemIds);
}
