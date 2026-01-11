import { withProjectState, withResetFn } from "state/utils";
import { insertIntoArray } from "utils/utils";
import { immer } from "zustand/middleware/immer";
import { createWithEqualityFn } from "zustand/traditional";
import { getDndSectionId } from "./dndState";

const DEBUG_DND_CHILDREN = true;

type ZustandDndChildren = {
  x: Record<string, Array<string>>;
  y: Record<string, string>;
};

export const useDndChildren = withProjectState(
  createWithEqualityFn(
    immer(
      withResetFn<ZustandDndChildren>(() => ({
        x: {}, // parent id to list of children
        y: {}, // child id to parent id
      })),
    ),
  ),
);

export function addDndChild(
  oldParentId: string | null,
  newParentId: string,
  childId: string,
  index: number,
) {
  useDndChildren.setState((state) => {
    if (oldParentId) {
      state.x[oldParentId] = (state.x[oldParentId] ?? []).filter(
        (x) => x !== childId,
      );
    }

    const existingChildren = state.x[newParentId] ?? [];
    const nextChildren = existingChildren.filter((x) => x !== childId);
    state.x[newParentId] = insertIntoArray(nextChildren, index, childId);
    state.y[childId] = newParentId;
    logDuplicates("addDndChild", newParentId, state.x[newParentId]);
  });
}

export function removeDndChild(childId: string) {
  useDndChildren.setState((state) => {
    const oldParentId = state.y[childId];
    if (oldParentId) {
      state.x[oldParentId] = (state.x[oldParentId] ?? []).filter(
        (x) => x !== childId,
      );
      delete state.y[childId];
    }
  });
}

export function replaceDndSectionWithTemp(id: string) {
  useDndChildren.setState((state) => {
    const parentId = state.y[id];
    if (parentId) {
      const tempId = getDndSectionId(id);
      for (const [key, children] of Object.entries(state.x)) {
        const nextChildren = children.filter((childId) => childId !== tempId);
        if (nextChildren.length !== children.length) {
          state.x[key] = nextChildren;
        }
      }

      const currChildren = state.x[parentId] ?? [];
      const index = currChildren.indexOf(id);
      if (index === -1) {
        state.x[parentId] = [...currChildren, tempId];
        state.y[tempId] = parentId;
        delete state.y[id];
        logInfo("replaceDndSectionWithTemp-missing", {
          id,
          parentId,
          currChildren,
        });
        return;
      }
      currChildren[index] = tempId;
      state.y[tempId] = parentId;
      delete state.y[id];
      logDuplicates("replaceDndSectionWithTemp", parentId, currChildren);
    } else {
      logInfo("replaceDndSectionWithTemp-no-parent", { id });
    }
  });
}

export function updateDndChildren(
  sectionIdsToChildren: Record<string, Array<string>>,
) {
  useDndChildren.setState((state) => {
    state.x = sectionIdsToChildren;
    state.y = {};
    for (const [id, children] of Object.entries(sectionIdsToChildren)) {
      for (const c of children) {
        state.y[c] = id;
      }
    }
  });
}

function logDuplicates(label: string, parentId: string, children: string[]) {
  if (!DEBUG_DND_CHILDREN) {
    return;
  }

  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const child of children) {
    if (seen.has(child)) {
      duplicates.add(child);
    } else {
      seen.add(child);
    }
  }

  if (duplicates.size > 0) {
    console.log("[dndChildren] duplicates", {
      label,
      parentId,
      duplicates: Array.from(duplicates),
      children,
    });
  }
}

function logInfo(label: string, data: Record<string, unknown>) {
  if (!DEBUG_DND_CHILDREN) {
    return;
  }

  console.log("[dndChildren]", label, data);
}
