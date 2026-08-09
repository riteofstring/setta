import { notifyWorkspaceDocumentChange } from "./documentChangeCallback";
import { getSectionItemTreeOrThrow, getSectionOrThrow } from "./documentSelectors";
import {
  assertWorkspaceItemControlConfiguration,
  assertWorkspaceItemControlPresentation,
  assertWorkspaceItemPresentation,
  hasWorkspaceItemPresentation,
} from "./itemPresentation";
import { getItemOrThrow } from "./itemTree";
import { useWorkspaceDocument } from "./stores";
import type {
  WorkspaceItemControlConfiguration,
  WorkspaceItemControlPresentation,
  WorkspaceItemPresentation,
} from "./types";

function getBuiltInItemState(sectionId: string, itemId: string) {
  const documentState = useWorkspaceDocument.getState();
  const section = getSectionOrThrow(documentState, sectionId);
  const itemTree = getSectionItemTreeOrThrow(documentState, sectionId);
  const item = getItemOrThrow(itemTree, itemId);
  if (!hasWorkspaceItemPresentation(item)) {
    throw new Error(`Section ${sectionId} item ${itemId} has no built-in presentation.`);
  }
  return { documentState, section, itemTree, item };
}

function commitItemPresentation(
  sectionId: string,
  itemId: string,
  presentation: WorkspaceItemPresentation,
) {
  assertWorkspaceItemPresentation(
    presentation,
    `Section ${sectionId} item ${itemId} presentation mutation`,
  );
  const { documentState, section, itemTree, item } = getBuiltInItemState(sectionId, itemId);
  useWorkspaceDocument.setState({
    sections: {
      ...documentState.sections,
      [sectionId]: {
        ...section,
        itemTree: {
          ...itemTree,
          items: {
            ...itemTree.items,
            [itemId]: { ...item, presentation },
          },
        },
      },
    },
  });
  notifyWorkspaceDocumentChange();
}

// Each typed-item edit has one canonical replacement and one document notification. Label and
// value updates preserve kind/configuration; kind changes require a complete control presentation;
// configuration updates carry their kind so a stale Inspector cannot write options onto another
// control after selection changes.
export function setItemLabel(sectionId: string, itemId: string, label: string): void {
  if (typeof label !== "string") {
    throw new Error(`Section ${sectionId} item ${itemId} label must be a string.`);
  }
  const { item } = getBuiltInItemState(sectionId, itemId);
  commitItemPresentation(sectionId, itemId, { ...item.presentation, label });
}

export function setItemValue(sectionId: string, itemId: string, value: string): void {
  if (typeof value !== "string") {
    throw new Error(`Section ${sectionId} item ${itemId} value must be a string.`);
  }
  const { item } = getBuiltInItemState(sectionId, itemId);
  if (item.presentation.control.kind === "group") {
    throw new Error(`Section ${sectionId} item ${itemId} is a group and has no controlled value.`);
  }
  commitItemPresentation(sectionId, itemId, {
    ...item.presentation,
    control: { ...item.presentation.control, value },
  });
}

export function setItemPresentation(
  sectionId: string,
  itemId: string,
  control: WorkspaceItemControlPresentation,
): void {
  assertWorkspaceItemControlPresentation(
    control,
    `Section ${sectionId} item ${itemId} control mutation`,
  );
  const { item } = getBuiltInItemState(sectionId, itemId);
  commitItemPresentation(sectionId, itemId, { ...item.presentation, control });
}

export function setItemControlConfiguration(
  sectionId: string,
  itemId: string,
  update: WorkspaceItemControlConfiguration,
): void {
  assertWorkspaceItemControlConfiguration(
    update,
    `Section ${sectionId} item ${itemId} control-configuration mutation`,
  );
  const { item } = getBuiltInItemState(sectionId, itemId);
  const currentControl = item.presentation.control;
  if (currentControl.kind === "group") {
    throw new Error(`Section ${sectionId} item ${itemId} is a group and has no control config.`);
  }
  if (currentControl.kind !== update.kind) {
    throw new Error(
      `Section ${sectionId} item ${itemId} is ${currentControl.kind}, not ${String(update.kind)}.`,
    );
  }
  const nextControl = {
    ...currentControl,
    configuration: update.configuration,
  } as WorkspaceItemControlPresentation;
  assertWorkspaceItemControlPresentation(
    nextControl,
    `Section ${sectionId} item ${itemId} control-configuration mutation`,
  );
  commitItemPresentation(sectionId, itemId, { ...item.presentation, control: nextControl });
}
