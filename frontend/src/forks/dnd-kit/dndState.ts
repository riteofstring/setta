import _ from "lodash";
import { manualDndChildrenReset } from "state/actions/sectionDisplayStructure";
import { withProjectState, withResetFn } from "state/utils";
import { getNowDate } from "utils/timestamps";
import { immer } from "zustand/middleware/immer";
import { createWithEqualityFn } from "zustand/traditional";
import type { Disabled } from "./adapter";
import { BehaviorDropType } from "./dropTypes";

export type ZustandDndState = {
  activeId: string | null;
  activeIsTopLevel: boolean;
  overId: string | null;
  triggerDistCondition: boolean;
  isSorting: boolean;
  isMovingFree: boolean;
  pendingDeactivation: boolean;
  disabled: Record<string, Disabled>;
  draggingIds: string[];
  draggingRectsById: Record<
    string,
    {
      top: number;
      left: number;
      right: number;
      bottom: number;
      width: number;
      height: number;
    }
  > | null;
  activeRect: {
    top: number;
    left: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  } | null;
  width: number | null;
  height: number | null;
  behaviorDropType: BehaviorDropType | null;
  times: {};
};

export const useDndState = withProjectState(
  createWithEqualityFn(
    immer(
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
    ),
  ),
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
  const initialState = useDndState.getInitialState();
  useDndState.setState((state) => ({
    ...initialState,
    disabled: state.disabled,
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
  useDndState.setState((state) => {
    state.disabled[sectionId] = disabled;
  });
}

export function setDndTime(sectionId: string) {
  useDndState.setState((state) => {
    state.times[sectionId] = getNowDate();
  });
}

const dndIdSuffix = "-TempDND";

export function getDndSectionId(sectionId: string) {
  return `${sectionId}${dndIdSuffix}`;
}

export function isTempSection(sectionId) {
  return sectionId.slice(-dndIdSuffix.length) === dndIdSuffix;
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
