import { createStore } from "zustand/vanilla";
import { insertIntoArray } from "../document/arrayUtils";
import {
  getSectionOrThrow,
  getTopLevelSectionIdsForDisplay,
} from "../document/documentSelectors";
import {
  getWorkspaceDocumentStore,
  type WorkspaceDocumentState,
} from "../document/stores";
import { withResetFn } from "../state/storeUtils";
import { useWorkspaceHost, useWorkspaceStore } from "../workspaceHostContext";
import { assertWorkspaceHostActive } from "../workspaceHostInternals";
import type { WorkspaceHost } from "../workspaceHost";
import { getDndSectionId, isTempSection } from "./dndIds";

// The reference's dnd children store (`dndChildren.ts`): the live parent→children projection
// the drag session mutates (temp placeholder insertion, live re-parenting) before one commit
// funnel writes the document.

type ZustandDndChildren = {
  x: Record<string, Array<string>>;
  y: Record<string, string>;
};

function createDndChildrenStore() {
  return createStore(
    withResetFn<ZustandDndChildren>(() => ({
      x: {}, // parent id to list of children
      y: {}, // child id to parent id
    })),
  );
}

const storesByHost = new WeakMap<
  WorkspaceHost,
  ReturnType<typeof createDndChildrenStore>
>();

export function getDndChildrenStore(host: WorkspaceHost) {
  assertWorkspaceHostActive(host);
  const existing = storesByHost.get(host);
  if (existing) {
    return existing;
  }
  const store = createDndChildrenStore();
  storesByHost.set(host, store);
  return store;
}

export function useDndChildren<T>(
  selector: (state: ZustandDndChildren) => T,
  equalityFn?: (left: T, right: T) => boolean,
): T {
  return useWorkspaceStore(
    getDndChildrenStore(useWorkspaceHost()),
    selector,
    equalityFn,
  );
}

export function addDndChild(
  host: WorkspaceHost,
  oldParentId: string | null,
  newParentId: string,
  childId: string,
  index: number,
) {
  getDndChildrenStore(host).setState((state) => {
    const x = { ...state.x };
    if (oldParentId) {
      x[oldParentId] = (x[oldParentId] ?? []).filter((id) => id !== childId);
    }

    const existingChildren = x[newParentId] ?? [];
    const nextChildren = existingChildren.filter((id) => id !== childId);
    x[newParentId] = insertIntoArray(nextChildren, index, childId);
    return { x, y: { ...state.y, [childId]: newParentId } };
  });
}

export function removeDndChild(host: WorkspaceHost, childId: string) {
  getDndChildrenStore(host).setState((state) => {
    const oldParentId = state.y[childId];
    if (!oldParentId) {
      return state;
    }
    const y = { ...state.y };
    delete y[childId];
    return {
      x: {
        ...state.x,
        [oldParentId]: (state.x[oldParentId] ?? []).filter(
          (id) => id !== childId,
        ),
      },
      y,
    };
  });
}

function clearTempChildren(state: ZustandDndChildren): ZustandDndChildren {
  const x = { ...state.x };
  for (const [parentId, children] of Object.entries(x)) {
    const nextChildren = children.filter((childId) => !isTempSection(childId));
    if (nextChildren.length !== children.length) {
      x[parentId] = nextChildren;
    }
  }

  const y = { ...state.y };
  for (const childId of Object.keys(y)) {
    if (isTempSection(childId)) {
      delete y[childId];
    }
  }
  return { x, y };
}

function resolveTempInsertion(
  children: Array<string>,
  sectionIds: Array<string>,
): { insertIndex: number; nextChildren: Array<string> } {
  const sectionIdSet = new Set(sectionIds);
  let insertIndex: number | null = null;
  const nextChildren = children.filter((childId, index) => {
    const shouldRemove = sectionIdSet.has(childId);
    if (shouldRemove && insertIndex === null) {
      insertIndex = index;
    }
    return !shouldRemove;
  });

  return {
    insertIndex: insertIndex ?? nextChildren.length,
    nextChildren,
  };
}

export function replaceDndSectionsWithTemp(
  host: WorkspaceHost,
  activeId: string,
  sectionIds: Array<string>,
) {
  getDndChildrenStore(host).setState((state) => {
    const firstSectionId = sectionIds[0];
    if (firstSectionId === undefined) {
      return state;
    }
    const parentId = state.y[firstSectionId];
    if (!parentId) {
      return state;
    }
    const cleared = clearTempChildren(state);

    const tempId = getDndSectionId(activeId);
    const { insertIndex, nextChildren } = resolveTempInsertion(
      cleared.x[parentId] ?? [],
      sectionIds,
    );
    const y = { ...cleared.y, [tempId]: parentId };
    for (const sectionId of sectionIds) {
      delete y[sectionId];
    }
    return {
      x: {
        ...cleared.x,
        [parentId]: insertIntoArray(nextChildren, insertIndex, tempId),
      },
      y,
    };
  });
}

export function updateDndChildren(
  host: WorkspaceHost,
  sectionIdsToChildren: Record<string, Array<string>>,
) {
  const y: Record<string, string> = {};
  for (const [id, children] of Object.entries(sectionIdsToChildren)) {
    for (const childId of children) {
      y[childId] = id;
    }
  }
  getDndChildrenStore(host).setState({ x: sectionIdsToChildren, y });
}

// The reference builds this projection in `getDisplayedSectionIdToChildren`
// (`state/actions/sectionInfos.ts`); the package walks the resolved document instead.
export function getDisplayedSectionIdToChildren(
  state: WorkspaceDocumentState,
): Record<string, Array<string>> {
  const output: Record<string, Array<string>> = {};
  const pending = [...getTopLevelSectionIdsForDisplay(state)];
  while (pending.length > 0) {
    const sectionId = pending.pop();
    if (sectionId === undefined) {
      break;
    }
    const children = getSectionOrThrow(state, sectionId).children;
    output[sectionId] = [...children];
    pending.push(...children);
  }
  return output;
}

// The reference's `manualDndChildrenReset`: resync the projection from the canonical document
// after a drag settles.
export function manualDndChildrenReset(host: WorkspaceHost) {
  updateDndChildren(
    host,
    getDisplayedSectionIdToChildren(getWorkspaceDocumentStore(host).getState()),
  );
}
