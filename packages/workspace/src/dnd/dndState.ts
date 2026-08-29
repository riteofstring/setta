import _ from "lodash";
import { createStore } from "zustand/vanilla";
import { withResetFn } from "../state/storeUtils";
import { useWorkspaceHost, useWorkspaceStore } from "../workspaceHostContext";
import { assertWorkspaceHostActive } from "../workspaceHostInternals";
import type { WorkspaceHost } from "../workspaceHost";
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

function createDndStateStore() {
  return createStore(
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
}

const storesByHost = new WeakMap<
  WorkspaceHost,
  ReturnType<typeof createDndStateStore>
>();

export function getDndStateStore(host: WorkspaceHost) {
  assertWorkspaceHostActive(host);
  const existing = storesByHost.get(host);
  if (existing) {
    return existing;
  }
  const store = createDndStateStore();
  storesByHost.set(host, store);
  return store;
}

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
  const { isMovingFree, isSorting } = getDndStateStore(host).getState();
  if (!isMovingFree && !isSorting) {
    return;
  }

  getDndStateStore(host).setState({ pendingDeactivation: true });
}

export function forceDeactivateDnd(host: WorkspaceHost) {
  resetDndState(host);
}

// The load half of the reference's project-switch reset registry: a document load force-ends any
// live drag session and prunes the per-section disable registry to the loaded document's
// sections. Mounted sections that survive the load keep their registrations — their mount
// effects do not re-run — while entries for removed sections would otherwise linger forever.
// Runs after the document publication so the children resync reads the loaded document.
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
    _.isEqual,
  );
}
