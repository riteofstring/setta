import { createStore } from "zustand/vanilla";
import { withResetFn } from "../state/storeUtils.js";
import {
  useWorkspaceHost,
  useWorkspaceStore,
} from "../workspaceHostContext.js";
import { createHostStoreGetter } from "../state/hostStore.js";
import type { WorkspaceHost } from "../workspaceHost.js";
import type { Disabled } from "./adapter/index.js";
import { manualDndChildrenReset } from "./dndChildren.js";
import type { BehaviorDropType } from "./dropTypes.js";
import { deepEqual } from "../state/deepEqual.js";

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
  isHandleDrag: boolean;
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

function createDndStateStore() {
  return createStore(
    withResetFn<ZustandDndState>(() => ({
      activeId: null,
      activeIsTopLevel: false,
      overId: null,
      triggerDistCondition: false,
      isSorting: false,
      isMovingFree: false,
      isHandleDrag: false,
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
}

export const getDndStateStore = createHostStoreGetter(createDndStateStore);

export function useDndState<T>(
  selector: (state: ZustandDndState) => T,
  equalityFn?: (left: T, right: T) => boolean,
): T {
  return useWorkspaceStore(
    getDndStateStore(useWorkspaceHost()),
    selector,
    equalityFn,
  );
}

export function setActiveDnd(
  host: WorkspaceHost,
  active: Pick<
    ZustandDndState,
    "activeId" | "activeIsTopLevel" | "activeRect" | "height" | "width"
  >,
) {
  getDndStateStore(host).setState(active);
}

export function activateDndSortingMode(host: WorkspaceHost) {
  getDndStateStore(host).setState({
    isSorting: true,
    isMovingFree: false,
    pendingDeactivation: false,
  });
}

export function activateDndMovingFreeMode(host: WorkspaceHost) {
  getDndStateStore(host).setState({
    isSorting: false,
    isMovingFree: true,
    pendingDeactivation: false,
  });
}

function resetDndState(host: WorkspaceHost) {
  getDndStateStore(host)
    .getState()
    .reset((api) => ({
      disabled: (api.getState() as ZustandDndState).disabled,
    }));
  manualDndChildrenReset(host);
}

export function deactivateDnd(host: WorkspaceHost) {
  const { isMovingFree, isSorting, isHandleDrag } =
    getDndStateStore(host).getState();
  if (isHandleDrag) return;
  if (!isMovingFree && !isSorting) {
    return;
  }

  getDndStateStore(host).setState({ pendingDeactivation: true });
}

export function forceDeactivateDnd(host: WorkspaceHost) {
  resetDndState(host);
}

export function resetDndSessionForLoadedDocument(
  host: WorkspaceHost,
  sectionIds: ReadonlySet<string>,
) {
  resetDndState(host);
  getDndStateStore(host).setState((state) => ({
    disabled: Object.fromEntries(
      Object.entries(state.disabled).filter(([id]) => sectionIds.has(id)),
    ),
  }));
}

export function setDndDisabled(
  host: WorkspaceHost,
  sectionId: string,
  disabled: Disabled,
) {
  getDndStateStore(host).setState((state) => ({
    disabled: { ...state.disabled, [sectionId]: disabled },
  }));
}

export function setDndTime(host: WorkspaceHost, sectionId: string | number) {
  getDndStateStore(host).setState((state) => ({
    times: { ...state.times, [sectionId]: Date.now() },
  }));
}

export function useDndMode() {
  return useDndState(
    (x) => ({
      isSorting: x.isSorting,
      isMovingFree: x.isMovingFree,
    }),
    deepEqual,
  );
}
