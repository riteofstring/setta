import { withProjectState, withResetFn } from "state/utils";
import { immer } from "zustand/middleware/immer";
import { createWithEqualityFn } from "zustand/traditional";

export type ParamListKey = "pinned" | "unpinned";

type ParamDndState = {
  activeId: string | null;
  sectionId: string | null;
  listKey: ParamListKey | null;
  rootId: string | null;
  draggingIds: string[];
  pendingReset: boolean;
  parentById: Record<string, string | null>;
  visibleChildrenByParent: Record<string, string[]>;
  activeRect: {
    top: number;
    left: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  } | null;
  dragOffset: { x: number; y: number } | null;
  placeholderWidth: number | null;
  placeholderHeight: number | null;
};

export const useParamDndState = withProjectState(
  createWithEqualityFn(
    immer(
      withResetFn<ParamDndState>(() => ({
        activeId: null,
        sectionId: null,
        listKey: null,
        rootId: null,
        draggingIds: [],
        pendingReset: false,
        parentById: {},
        visibleChildrenByParent: {},
        activeRect: null,
        dragOffset: null,
        placeholderWidth: null,
        placeholderHeight: null,
      })),
    ),
  ),
);

export function setParamDndState(nextState: Partial<ParamDndState>) {
  useParamDndState.setState(nextState);
}

export function resetParamDndState() {
  useParamDndState.getState().reset();
}

const PARAM_DND_ID_SUFFIX = "-TempParamDND";

export function getParamDndId(paramId: string) {
  return `${paramId}${PARAM_DND_ID_SUFFIX}`;
}

export function isTempParam(paramId: string) {
  return paramId.endsWith(PARAM_DND_ID_SUFFIX);
}
