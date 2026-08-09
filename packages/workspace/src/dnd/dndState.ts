import _ from "lodash";
import { createWithEqualityFn } from "zustand/traditional";
import { withResetFn } from "../state/storeUtils";
import type { Disabled } from "./adapter";
import { manualDndChildrenReset } from "./dndChildren";
import type { BehaviorDropType } from "./dropTypes";

// The reference's drag-session store (`dndState.ts`), written in the package store style
// (plain setState instead of the reference's immer middleware; identical observable state). The
// reference's project-switch reset registry is replaced by the package store lifecycle: the dnd
// context resyncs from the document on mount and on document changes.

type DragRect = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

type ZustandDndState = {
  activeId: string | null;
  activeIsTopLevel: boolean;
  overId: string | null;
  triggerDistCondition: boolean;
  isSorting: boolean;
  isMovingFree: boolean;
  pendingDeactivation: boolean;
  disabled: Record<string, Disabled>;
  draggingIds: Array<string>;
  draggingRectsById: Record<string, DragRect> | null;
  activeRect: DragRect | null;
  width: number | null;
  height: number | null;
  behaviorDropType: BehaviorDropType | null;
  times: Record<string, number>;
};

export const useDndState = createWithEqualityFn(
  withResetFn<ZustandDndState>(() => ({
    activeId: null,
    activeIsTopLevel: false,
    overId: null,
    triggerDistCondition: false,
    isSorting: false,
    isMovingFree: false,
    pendingDeactivation: false,
    disabled: {},
    draggingIds: [],
    draggingRectsById: null,
    activeRect: null,
    width: null,
    height: null,
    behaviorDropType: null,
    times: {},
  })),
);

export function setActiveDnd(
  id: string,
  isTopLevel: boolean,
  width: number,
  height: number,
  activeRect: ZustandDndState["activeRect"],
) {
  useDndState.setState({
    activeId: id,
    activeIsTopLevel: isTopLevel,
    activeRect,
    width,
    height,
  });
}

export function activateDndSortingMode() {
  useDndState.setState({
    isSorting: true,
    isMovingFree: false,
    pendingDeactivation: false,
  });
}

export function activateDndMovingFreeMode() {
  useDndState.setState({
    isSorting: false,
    isMovingFree: true,
    pendingDeactivation: false,
  });
}

function resetDndState() {
  useDndState.getState().reset((api) => ({
    disabled: (api.getState() as ZustandDndState).disabled,
  }));
  manualDndChildrenReset();
}

export function deactivateDnd() {
  const { isMovingFree, isSorting } = useDndState.getState();
  if (!isMovingFree && !isSorting) {
    return;
  }

  useDndState.setState({ pendingDeactivation: true });
}

export function forceDeactivateDnd() {
  resetDndState();
}

export function setDndDisabled(sectionId: string, disabled: Disabled) {
  useDndState.setState((state) => ({
    disabled: { ...state.disabled, [sectionId]: disabled },
  }));
}

export function setDndTime(sectionId: string | number) {
  useDndState.setState((state) => ({
    times: { ...state.times, [sectionId]: Date.now() },
  }));
}

export function useDndMode() {
  return useDndState(
    (x) => ({
      isSorting: x.isSorting,
      isMovingFree: x.isMovingFree,
    }),
    _.isEqual,
  );
}
