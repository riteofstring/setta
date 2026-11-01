import { notifyWorkspaceDocumentChange } from "./documentChangeCallback.js";
import {
  getSectionItemTreeOrThrow,
  getSectionOrThrow,
} from "./documentSelectors.js";
import {
  assertWorkspaceItemControlConfiguration,
  assertWorkspaceItemControlPresentation,
  assertWorkspaceItemPresentation,
  hasWorkspaceItemPresentation,
} from "./itemPresentation.js";
import { getItemOrThrow } from "./itemTree.js";
import { getWorkspaceDocumentStore } from "./stores.js";
import type {
  WorkspaceItemControlConfiguration,
  WorkspaceItemControlPresentation,
  WorkspaceItemPresentation,
} from "./types.js";
import type { WorkspaceHost } from "../workspaceHost.js";

function getBuiltInItemState(
  host: WorkspaceHost,
  sectionId: string,
  itemId: string,
) {
  const documentState = getWorkspaceDocumentStore(host).getState();
  const section = getSectionOrThrow(documentState, sectionId);
  const itemTree = getSectionItemTreeOrThrow(documentState, sectionId);
  const item = getItemOrThrow(itemTree, itemId);
  if (!hasWorkspaceItemPresentation(item)) {
    throw new Error(
      `Section ${sectionId} item ${itemId} has no built-in presentation.`,
    );
  }
  return { documentState, section, itemTree, item };
}

function commitItemPresentation(
  host: WorkspaceHost,
  sectionId: string,
  itemId: string,
  presentation: WorkspaceItemPresentation,
) {
  assertWorkspaceItemPresentation(
    presentation,
    `Section ${sectionId} item ${itemId} presentation mutation`,
  );
  const { documentState, section, itemTree, item } = getBuiltInItemState(
    host,
    sectionId,
    itemId,
  );
  getWorkspaceDocumentStore(host).setState({
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
  notifyWorkspaceDocumentChange(host, null);
}

export function setItemLabel(
  host: WorkspaceHost,
  sectionId: string,
  itemId: string,
  label: string,
): void {
  if (typeof label !== "string") {
    throw new Error(
      `Section ${sectionId} item ${itemId} label must be a string.`,
    );
  }
  const { item } = getBuiltInItemState(host, sectionId, itemId);
  if (!item.presentation.labelEditable) {
    throw new Error(
      `Section ${sectionId} item ${itemId} label is not editable.`,
    );
  }
  commitItemPresentation(host, sectionId, itemId, {
    ...item.presentation,
    label,
  });
}

export function setItemHelpText(
  host: WorkspaceHost,
  sectionId: string,
  itemId: string,
  helpText: string | null,
): void {
  if (helpText !== null && typeof helpText !== "string") {
    throw new Error(
      `Section ${sectionId} item ${itemId} help text must be a string or null.`,
    );
  }
  const { item } = getBuiltInItemState(host, sectionId, itemId);
  if (helpText === null) {
    const presentation = { ...item.presentation };
    delete presentation.helpText;
    commitItemPresentation(host, sectionId, itemId, presentation);
    return;
  }
  commitItemPresentation(host, sectionId, itemId, {
    ...item.presentation,
    helpText,
  });
}

export function setItemValue(
  host: WorkspaceHost,
  sectionId: string,
  itemId: string,
  value: string,
): void {
  if (typeof value !== "string") {
    throw new Error(
      `Section ${sectionId} item ${itemId} value must be a string.`,
    );
  }
  const { item } = getBuiltInItemState(host, sectionId, itemId);
  if (item.presentation.control.kind === "group") {
    throw new Error(
      `Section ${sectionId} item ${itemId} is a group and has no controlled value.`,
    );
  }
  commitItemPresentation(host, sectionId, itemId, {
    ...item.presentation,
    control: { ...item.presentation.control, value },
  });
}

export function setItemPresentation(
  host: WorkspaceHost,
  sectionId: string,
  itemId: string,
  control: WorkspaceItemControlPresentation,
): void {
  assertWorkspaceItemControlPresentation(
    control,
    `Section ${sectionId} item ${itemId} control mutation`,
  );
  const { item } = getBuiltInItemState(host, sectionId, itemId);
  commitItemPresentation(host, sectionId, itemId, {
    ...item.presentation,
    control,
  });
}

export function setItemControlConfiguration(
  host: WorkspaceHost,
  sectionId: string,
  itemId: string,
  update: WorkspaceItemControlConfiguration,
): void {
  assertWorkspaceItemControlConfiguration(
    update,
    `Section ${sectionId} item ${itemId} control-configuration mutation`,
  );
  const { item } = getBuiltInItemState(host, sectionId, itemId);
  const currentControl = item.presentation.control;
  if (currentControl.kind === "group") {
    throw new Error(
      `Section ${sectionId} item ${itemId} is a group and has no control config.`,
    );
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
  commitItemPresentation(host, sectionId, itemId, {
    ...item.presentation,
    control: nextControl,
  });
}
