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

const PARAM_DND_LIST_KEY_SEPARATOR = "::settaParamList::";
const PARAM_DND_TEMP_SUFFIX = "::TempParamDND";

export function getParamDndItemId(paramId: string, listKey: ParamListKey) {
  return `${paramId}${PARAM_DND_LIST_KEY_SEPARATOR}${listKey}`;
}

export function getParamIdFromDndItemId(dndId: string): string {
  const base = stripTempSuffix(dndId);
  const separatorIndex = base.lastIndexOf(PARAM_DND_LIST_KEY_SEPARATOR);
  if (separatorIndex === -1) {
    return base;
  }
  return base.slice(0, separatorIndex);
}

export function getTempParamDndId(dndId: string) {
  return `${dndId}${PARAM_DND_TEMP_SUFFIX}`;
}

export function isTempParam(paramId: string) {
  return paramId.endsWith(PARAM_DND_TEMP_SUFFIX);
}

function stripTempSuffix(paramId: string) {
  if (!isTempParam(paramId)) {
    return paramId;
  }
  return paramId.slice(0, -PARAM_DND_TEMP_SUFFIX.length);
}
