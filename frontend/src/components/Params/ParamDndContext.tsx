import {
  SortableContext,
  verticalListSortingStrategy,
} from "forks/dnd-kit/adapter";
import { useParamDndChildren } from "forks/dnd-kit/paramDndChildren";
import {
  getParamDndItemId,
  isTempParam,
  useParamDndState,
  type ParamListKey,
} from "forks/dnd-kit/paramDndState";
import _ from "lodash";
import React, { createContext, useContext, useMemo } from "react";
import type { ParamTreeView } from "state/actions/params/paramTree";

type ParamDndContextValue = {
  enabled: boolean;
  sectionId: string;
  listKey: ParamListKey;
};

const ParamDndContext = createContext<ParamDndContextValue | null>(null);

export function useParamDndContext() {
  return useContext(ParamDndContext);
}

export function useParamDndChildrenForParent(
  parentId: string,
  fallback: string[],
) {
  const context = useParamDndContext();
  const { activeId, sectionId, listKey } = useParamDndState(
    (state) => ({
      activeId: state.activeId,
      sectionId: state.sectionId,
      listKey: state.listKey,
    }),
    _.isEqual,
  );
  const isActiveList = Boolean(
    context &&
      activeId &&
      sectionId === context.sectionId &&
      listKey === context.listKey,
  );
  const tempChildren = useParamDndChildren(
    (state) => (isActiveList ? state.x[parentId] ?? null : null),
    _.isEqual,
  );
  return tempChildren ?? fallback;
}

export function ParamDndProvider({
  sectionId,
  listKey,
  tree,
  enabled,
  children,
}: {
  sectionId: string;
  listKey: ParamListKey;
  tree: ParamTreeView;
  enabled: boolean;
  children: React.ReactNode;
}) {
  const contextValue = useMemo(
    () => ({
      enabled,
      listKey,
      sectionId,
    }),
    [enabled, listKey, sectionId],
  );
  const activeInfo = useParamDndState(
    (state) => ({
      activeId: state.activeId,
      sectionId: state.sectionId,
      listKey: state.listKey,
    }),
    _.isEqual,
  );
  const isActiveList =
    Boolean(activeInfo.activeId) &&
    activeInfo.sectionId === sectionId &&
    activeInfo.listKey === listKey;
  const tempChildren = useParamDndChildren(
    (state) => (isActiveList ? state.x : null),
    _.isEqual,
  );

  const items = useMemo(() => {
    const toDndId = (id: string) =>
      isTempParam(id) ? id : getParamDndItemId(id, listKey);
    if (isActiveList && tempChildren) {
      return flattenParamChildren(tree.rootId, tempChildren).map(toDndId);
    }
    return tree.flat.map((item) => toDndId(item.id));
  }, [isActiveList, listKey, tempChildren, tree.flat, tree.rootId]);

  return (
    <ParamDndContext.Provider value={contextValue}>
      <SortableContext
        id={sectionId}
        items={items}
        strategy={verticalListSortingStrategy}
      >
        {children}
      </SortableContext>
    </ParamDndContext.Provider>
  );
}

function flattenParamChildren(
  rootId: string,
  childrenByParent: Record<string, string[]>,
) {
  const flat: string[] = [];

  function walk(parentId: string) {
    const children = childrenByParent[parentId] ?? [];
    for (const childId of children) {
      flat.push(childId);
      walk(childId);
    }
  }

  walk(rootId);
  return flat;
}
