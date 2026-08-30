import { useEffect, useRef, useState } from "react";
import { createStore } from "zustand/vanilla";
import { getSectionRect } from "../canvas/graph";
import {
  fitWorkspaceViewportToBounds,
  type WorkspaceViewportBoundsFitOptions,
} from "../canvas/viewportHelpers";
import { isWorkspaceSectionVisible } from "../document/savedViewDisplay";
import { getWorkspaceDocumentStore } from "../document/stores";
import { getSectionRefsStore } from "../section/sectionRefs";
import { useWorkspaceHost, useWorkspaceStore } from "../workspaceHostContext";
import {
  assertWorkspaceHostActive,
  registerWorkspaceHostCleanup,
} from "../workspaceHostInternals";
import type { WorkspaceHost } from "../workspaceHost";
import type { Rect } from "../canvas/types";

export const WORKSPACE_SECTION_ATTENTION_LINGER_DURATION = 650;
export const WORKSPACE_SECTION_FIT_DURATION = 500;
export const WORKSPACE_SECTION_FIT_MAXIMUM_ZOOM = 1;
export const WORKSPACE_SECTION_FIT_PADDING = 0.1;

export type WorkspaceSectionFitOptions = Readonly<{
  duration?: number;
  maxZoom?: number;
  padding?: number;
}>;

export type WorkspaceSectionAttentionState = Readonly<{
  isTransitioning: boolean;
  sectionIds: ReadonlyArray<string>;
}>;

type WorkspaceSectionAttentionStoreState = WorkspaceSectionAttentionState & {
  resetVersion: number;
  transitionOwner: number;
};

type WorkspaceSectionAttentionRuntime = {
  store: ReturnType<typeof createWorkspaceSectionAttentionStore>;
};

const EMPTY_SECTION_IDS: ReadonlyArray<string> = Object.freeze([]);
const runtimesByHost = new WeakMap<
  WorkspaceHost,
  WorkspaceSectionAttentionRuntime
>();

function createWorkspaceSectionAttentionStore() {
  return createStore<WorkspaceSectionAttentionStoreState>(() => ({
    isTransitioning: false,
    resetVersion: 0,
    sectionIds: EMPTY_SECTION_IDS,
    transitionOwner: 0,
  }));
}

function getWorkspaceSectionAttentionRuntime(
  host: WorkspaceHost,
): WorkspaceSectionAttentionRuntime {
  assertWorkspaceHostActive(host);
  const existing = runtimesByHost.get(host);
  if (existing) {
    return existing;
  }
  const runtime: WorkspaceSectionAttentionRuntime = {
    store: createWorkspaceSectionAttentionStore(),
  };
  runtimesByHost.set(host, runtime);
  registerWorkspaceHostCleanup(host, () => {
    runtimesByHost.delete(host);
  });
  return runtime;
}

function getUniqueSectionIds(
  sectionIds: ReadonlyArray<string>,
): ReadonlyArray<string> {
  if (!Array.isArray(sectionIds)) {
    throw new Error(
      "Workspace section attention requires an array of section ids.",
    );
  }
  const uniqueIds: Array<string> = [];
  const seenIds = new Set<string>();
  for (const sectionId of sectionIds) {
    if (typeof sectionId !== "string" || sectionId.trim() === "") {
      throw new Error(
        "Workspace section attention requires nonblank section ids.",
      );
    }
    if (!seenIds.has(sectionId)) {
      seenIds.add(sectionId);
      uniqueIds.push(sectionId);
    }
  }
  return Object.freeze(uniqueIds);
}

function hasPositiveSectionBounds(bounds: Rect | null): bounds is Rect {
  return (
    bounds !== null &&
    [bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) &&
    bounds.width > 0 &&
    bounds.height > 0
  );
}

function getValidatedWorkspaceSectionBounds(
  host: WorkspaceHost,
  sectionIds: ReadonlyArray<string>,
): { bounds: Rect; sectionIds: ReadonlyArray<string> } {
  const uniqueIds = getUniqueSectionIds(sectionIds);
  if (uniqueIds.length === 0) {
    throw new Error("Cannot fit an empty workspace section set.");
  }
  const documentState = getWorkspaceDocumentStore(host).getState();
  const refs = getSectionRefsStore(host).getState();
  const rects: Array<Rect> = [];
  for (const sectionId of uniqueIds) {
    if (!Object.hasOwn(documentState.sections, sectionId)) {
      throw new Error(`Cannot attend unknown workspace section ${sectionId}.`);
    }
    if (!isWorkspaceSectionVisible(documentState, sectionId)) {
      throw new Error(`Cannot attend hidden workspace section ${sectionId}.`);
    }
    if (!refs.selfOnly[sectionId] && !refs.withNested[sectionId]) {
      throw new Error(
        `Cannot attend workspace section ${sectionId} before its section shell mounted.`,
      );
    }
    const bounds = getSectionRect(host, sectionId, true);
    if (!hasPositiveSectionBounds(bounds)) {
      throw new Error(
        `Cannot attend workspace section ${sectionId} with empty section shell bounds.`,
      );
    }
    rects.push(bounds);
  }
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return {
    bounds: { x: left, y: top, width: right - left, height: bottom - top },
    sectionIds: uniqueIds,
  };
}

function resolveWorkspaceSectionFitOptions(
  options: WorkspaceSectionFitOptions | undefined,
): WorkspaceViewportBoundsFitOptions {
  if (
    options !== undefined &&
    (options === null || typeof options !== "object" || Array.isArray(options))
  ) {
    throw new Error("Workspace section fit options must be an object.");
  }
  return {
    duration: options?.duration ?? WORKSPACE_SECTION_FIT_DURATION,
    maxZoom: options?.maxZoom ?? WORKSPACE_SECTION_FIT_MAXIMUM_ZOOM,
    padding: options?.padding ?? WORKSPACE_SECTION_FIT_PADDING,
  };
}

function sectionIdsEqual(
  left: ReadonlyArray<string>,
  right: ReadonlyArray<string>,
): boolean {
  return (
    left.length === right.length &&
    left.every((id, index) => id === right[index])
  );
}

function setWorkspaceSectionFitTransition(
  runtime: WorkspaceSectionAttentionRuntime,
  duration: number,
): number {
  const current = runtime.store.getState();
  const transitionOwner = current.transitionOwner + 1;
  runtime.store.setState({
    isTransitioning: duration > 0,
    transitionOwner,
  });
  return transitionOwner;
}

function settleWorkspaceSectionFitTransition(
  runtime: WorkspaceSectionAttentionRuntime,
  transitionOwner: number,
): void {
  if (runtime.store.getState().transitionOwner !== transitionOwner) {
    return;
  }
  runtime.store.setState({ isTransitioning: false });
}

export function fitWorkspaceSections(
  host: WorkspaceHost,
  sectionIds: ReadonlyArray<string>,
  options?: WorkspaceSectionFitOptions,
): void {
  const target = getValidatedWorkspaceSectionBounds(host, sectionIds);
  const fit = fitWorkspaceViewportToBounds(
    host,
    target.bounds,
    resolveWorkspaceSectionFitOptions(options),
  );
  const runtime = getWorkspaceSectionAttentionRuntime(host);
  const transitionOwner = setWorkspaceSectionFitTransition(
    runtime,
    fit.duration,
  );
  if (fit.duration === 0) {
    return;
  }
  void fit.transition.then(
    () => settleWorkspaceSectionFitTransition(runtime, transitionOwner),
    () => settleWorkspaceSectionFitTransition(runtime, transitionOwner),
  );
}

export function setWorkspaceSectionAttention(
  host: WorkspaceHost,
  sectionIds: ReadonlyArray<string>,
): void {
  const runtime = getWorkspaceSectionAttentionRuntime(host);
  const uniqueIds = getUniqueSectionIds(sectionIds);
  if (uniqueIds.length === 0) {
    if (runtime.store.getState().sectionIds.length > 0) {
      runtime.store.setState({ sectionIds: EMPTY_SECTION_IDS });
    }
    return;
  }
  const target = getValidatedWorkspaceSectionBounds(host, uniqueIds);
  if (
    !sectionIdsEqual(runtime.store.getState().sectionIds, target.sectionIds)
  ) {
    runtime.store.setState({ sectionIds: target.sectionIds });
  }
}

export function resetWorkspaceSectionAttention(host: WorkspaceHost): void {
  const runtime = getWorkspaceSectionAttentionRuntime(host);
  const current = runtime.store.getState();
  runtime.store.setState({
    isTransitioning: false,
    resetVersion: current.resetVersion + 1,
    sectionIds: EMPTY_SECTION_IDS,
    transitionOwner: current.transitionOwner + 1,
  });
}

export function getWorkspaceSectionAttentionState(
  host: WorkspaceHost,
): WorkspaceSectionAttentionState {
  const { isTransitioning, sectionIds } =
    getWorkspaceSectionAttentionRuntime(host).store.getState();
  return { isTransitioning, sectionIds };
}

function useWorkspaceSectionAttentionStore<T>(
  selector: (state: WorkspaceSectionAttentionStoreState) => T,
  equalityFn?: (left: T, right: T) => boolean,
): T {
  const host = useWorkspaceHost();
  return useWorkspaceStore(
    getWorkspaceSectionAttentionRuntime(host).store,
    selector,
    equalityFn,
  );
}

export function useWorkspaceSectionAttention<T>(
  selector: (state: WorkspaceSectionAttentionState) => T,
  equalityFn?: (left: T, right: T) => boolean,
): T {
  return useWorkspaceSectionAttentionStore(selector, equalityFn);
}

export function useWorkspaceSectionAttentionTransitioning(): boolean {
  return useWorkspaceSectionAttentionStore((state) => state.isTransitioning);
}

export function useWorkspaceSectionAttentionHighlight(
  sectionId: string,
): boolean {
  const isHighlighted = useWorkspaceSectionAttentionStore((state) =>
    state.sectionIds.includes(sectionId),
  );
  const resetVersion = useWorkspaceSectionAttentionStore(
    (state) => state.resetVersion,
  );
  const renderedResetVersion = useRef(resetVersion);
  const resetChanged = renderedResetVersion.current !== resetVersion;
  if (resetChanged) {
    renderedResetVersion.current = resetVersion;
  }
  const [showHighlight, setShowHighlight] = useState(isHighlighted);

  useEffect(() => {
    if (resetChanged) {
      setShowHighlight(false);
      return;
    }
    if (isHighlighted) {
      setShowHighlight(true);
      return;
    }
    if (!showHighlight) {
      return;
    }
    const timeout = setTimeout(() => {
      setShowHighlight(false);
    }, WORKSPACE_SECTION_ATTENTION_LINGER_DURATION);
    return () => clearTimeout(timeout);
  }, [isHighlighted, resetChanged, showHighlight]);

  return resetChanged ? false : showHighlight;
}
