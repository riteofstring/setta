import type { ParamListKey } from "./paramDndState";

type BuildParamDndContextViewArgs = {
  canEditStructure: boolean;
  isSelectingParams: boolean;
  paramDndActive: boolean;
};

type ParamDndCollisionLike = {
  id: string | number;
  data?: {
    droppable?: {
      data?: unknown;
    };
  };
};

type BuildParamDndCollisionScopeViewArgs<T extends ParamDndCollisionLike> = {
  collisions: T[] | null;
  listKey: ParamListKey | null;
};

export type ParamDndContextView = {
  dndContext: {
    isMovingFree: false;
    isSorting: false;
  };
  shouldRenderHelpers: boolean;
};

export type ParamDndCollisionScopeView<T extends ParamDndCollisionLike> = {
  collisions: T[] | null;
  filteredOutCollisions: boolean;
  filteredToEmpty: boolean;
};

const PARAM_DND_CONTEXT_VIEW = {
  isMovingFree: false,
  isSorting: false,
} as const;

export function buildParamDndContextView({
  canEditStructure,
  isSelectingParams,
  paramDndActive,
}: BuildParamDndContextViewArgs): ParamDndContextView {
  const paramDndEnabled = canEditStructure && isSelectingParams;

  return {
    dndContext: PARAM_DND_CONTEXT_VIEW,
    shouldRenderHelpers: paramDndEnabled || paramDndActive,
  };
}

export function buildParamDndCollisionScopeView<
  T extends ParamDndCollisionLike,
>({
  collisions,
  listKey,
}: BuildParamDndCollisionScopeViewArgs<T>): ParamDndCollisionScopeView<T> {
  if (!listKey || !collisions || collisions.length === 0) {
    return {
      collisions,
      filteredOutCollisions: false,
      filteredToEmpty: false,
    };
  }

  const scopedCollisions = collisions.filter(
    (collision) => getCollisionListKey(collision) === listKey,
  );

  if (scopedCollisions.length === 0) {
    return {
      collisions: null,
      filteredOutCollisions: true,
      filteredToEmpty: true,
    };
  }

  return {
    collisions: scopedCollisions,
    filteredOutCollisions: scopedCollisions.length !== collisions.length,
    filteredToEmpty: false,
  };
}

function getCollisionListKey(
  collision: ParamDndCollisionLike,
): ParamListKey | null {
  const droppableData = collision.data?.droppable?.data;
  if (!droppableData || typeof droppableData !== "object") {
    return null;
  }
  if (!("current" in droppableData)) {
    return null;
  }

  const current = droppableData.current;
  if (!current || typeof current !== "object") {
    return null;
  }
  if (!("listKey" in current)) {
    return null;
  }

  const { listKey } = current;
  if (listKey === "pinned" || listKey === "unpinned") {
    return listKey;
  }
  return null;
}
