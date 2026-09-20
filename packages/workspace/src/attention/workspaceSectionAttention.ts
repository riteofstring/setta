import { useEffect, useRef, useState } from "react";
import { createStore } from "zustand/vanilla";
import { getSectionRect } from "../canvas/graph";
import {
  fitWorkspaceViewportToBounds,
  type WorkspaceViewportBoundsFitOptions,
} from "../canvas/viewportHelpers";
import { getReactFlowStore } from "../canvas/store";
import {
  getWorkspaceXyflowRuntime,
  subscribeWorkspaceXyflowRuntime,
} from "../canvas/xyflow/workspaceXyflowRuntime";
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
const WORKSPACE_SECTION_FIT_MAXIMUM_ZOOM = 1;
const WORKSPACE_SECTION_FIT_PADDING = 0.1;

export type WorkspaceSectionFitOptions = Readonly<{
  duration?: number;
  maxZoom?: number;
  padding?: number;
}>;

type WorkspaceSectionAttentionState = Readonly<{
  isTransitioning: boolean;
  sectionIds: ReadonlyArray<string>;
}>;

type WorkspaceSectionAttentionStoreState = WorkspaceSectionAttentionState & {
  resetVersion: number;
  transitionOwner: number;
};

type WorkspaceSectionAttentionRuntime = {
  currentFit: WorkspaceSectionFitOperation | null;
  fitOwner: number;
  store: ReturnType<typeof createWorkspaceSectionAttentionStore>;
};

type WorkspaceSectionFitOperation = {
  cleanup: () => void;
  owner: number;
  resolve: () => void;
  settled: boolean;
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
    currentFit: null,
    fitOwner: 0,
    store: createWorkspaceSectionAttentionStore(),
  };
  runtimesByHost.set(host, runtime);
  registerWorkspaceHostCleanup(host, () => {
    cancelWorkspaceSectionFit(runtime);
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

function getValidatedWorkspaceSectionIds(
  host: WorkspaceHost,
  sectionIds: ReadonlyArray<string>,
): ReadonlyArray<string> {
  const uniqueIds = getUniqueSectionIds(sectionIds);
  const documentState = getWorkspaceDocumentStore(host).getState();
  for (const sectionId of uniqueIds) {
    if (!Object.hasOwn(documentState.sections, sectionId)) {
      throw new Error(`Cannot attend unknown workspace section ${sectionId}.`);
    }
    if (!isWorkspaceSectionVisible(documentState, sectionId)) {
      throw new Error(`Cannot attend hidden workspace section ${sectionId}.`);
    }
  }
  return uniqueIds;
}

function getReadyWorkspaceSectionBounds(
  host: WorkspaceHost,
  sectionIds: ReadonlyArray<string>,
): Rect | null {
  const refs = getSectionRefsStore(host).getState();
  const rects: Array<Rect> = [];
  for (const sectionId of sectionIds) {
    if (!refs.selfOnly[sectionId] && !refs.withNested[sectionId]) return null;
    const bounds = getSectionRect(host, sectionId, true);
    if (!hasPositiveSectionBounds(bounds)) return null;
    rects.push(bounds);
  }
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function assertWorkspaceSectionFitOptions(
  options: WorkspaceSectionFitOptions | undefined,
): void {
  if (options === undefined) {
    return;
  }
  if (options === null || typeof options !== "object") {
    throw new Error("Workspace section fit options must be an object.");
  }
  if (Array.isArray(options)) {
    throw new Error("Workspace section fit options must be an object.");
  }
}

function resolveWorkspaceSectionFitOptions(
  options: WorkspaceSectionFitOptions | undefined,
): WorkspaceViewportBoundsFitOptions {
  assertWorkspaceSectionFitOptions(options);
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

function settleWorkspaceSectionFitOperation(
  runtime: WorkspaceSectionAttentionRuntime,
  operation: WorkspaceSectionFitOperation,
): void {
  if (operation.settled) return;
  operation.settled = true;
  operation.cleanup();
  if (runtime.currentFit === operation) runtime.currentFit = null;
  operation.resolve();
}

function cancelWorkspaceSectionFit(
  runtime: WorkspaceSectionAttentionRuntime,
): void {
  runtime.fitOwner += 1;
  const operation = runtime.currentFit;
  if (operation) settleWorkspaceSectionFitOperation(runtime, operation);
  const current = runtime.store.getState();
  runtime.store.setState({
    isTransitioning: false,
    transitionOwner: current.transitionOwner + 1,
  });
}

function isWorkspaceSectionFitSurfaceReady(host: WorkspaceHost): boolean {
  const { height, viewportInsets, width } = getReactFlowStore(host).getState();
  return (
    [height, width, ...Object.values(viewportInsets)].every(Number.isFinite) &&
    width - viewportInsets.left - viewportInsets.right > 0 &&
    height - viewportInsets.top - viewportInsets.bottom > 0 &&
    getWorkspaceXyflowRuntime(host).getInstance() !== null
  );
}

function observeWorkspaceSectionFitElements(
  host: WorkspaceHost,
  sectionIds: ReadonlyArray<string>,
  observer: ResizeObserver | null,
  observedElements: Set<HTMLElement>,
): void {
  if (!observer) return;
  const refs = getSectionRefsStore(host).getState();
  for (const sectionId of sectionIds) {
    const element = refs.selfOnly[sectionId] ?? refs.withNested[sectionId];
    if (element && !observedElements.has(element)) {
      observedElements.add(element);
      observer.observe(element);
    }
  }
}

export function fitWorkspaceSections(
  host: WorkspaceHost,
  sectionIds: ReadonlyArray<string>,
  options?: WorkspaceSectionFitOptions,
): Promise<void> {
  const targetSectionIds = getValidatedWorkspaceSectionIds(host, sectionIds);
  if (targetSectionIds.length === 0) {
    throw new Error("Cannot fit an empty workspace section set.");
  }
  const fitOptions = resolveWorkspaceSectionFitOptions(options);
  const runtime = getWorkspaceSectionAttentionRuntime(host);
  cancelWorkspaceSectionFit(runtime);
  const owner = runtime.fitOwner + 1;
  runtime.fitOwner = owner;
  let resolveOperation = () => {};
  const result = new Promise<void>((resolve) => {
    resolveOperation = resolve;
  });
  const operation: WorkspaceSectionFitOperation = {
    cleanup: () => {},
    owner,
    resolve: resolveOperation,
    settled: false,
  };
  runtime.currentFit = operation;
  const observedElements = new Set<HTMLElement>();
  let attempting = false;
  let readinessSettled = false;
  let attempt = () => {};
  const resizeObserver =
    typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => attempt());
  const unsubscribeDocument = getWorkspaceDocumentStore(host).subscribe(() =>
    attempt(),
  );
  const unsubscribeRefs = getSectionRefsStore(host).subscribe(() => attempt());
  const unsubscribeCanvas = getReactFlowStore(host).subscribe(() => attempt());
  const unsubscribeRuntime = subscribeWorkspaceXyflowRuntime(host, () =>
    attempt(),
  );
  const cleanupReadiness = () => {
    if (readinessSettled) return;
    readinessSettled = true;
    resizeObserver?.disconnect();
    unsubscribeCanvas();
    unsubscribeDocument();
    unsubscribeRefs();
    unsubscribeRuntime();
  };
  operation.cleanup = cleanupReadiness;
  attempt = () => {
    if (
      attempting ||
      operation.settled ||
      runtime.currentFit !== operation ||
      runtime.fitOwner !== operation.owner
    ) {
      return;
    }
    attempting = true;
    try {
      try {
        getValidatedWorkspaceSectionIds(host, targetSectionIds);
      } catch {
        settleWorkspaceSectionFitOperation(runtime, operation);
        return;
      }
      observeWorkspaceSectionFitElements(
        host,
        targetSectionIds,
        resizeObserver,
        observedElements,
      );
      const bounds = getReadyWorkspaceSectionBounds(host, targetSectionIds);
      if (!bounds || !isWorkspaceSectionFitSurfaceReady(host)) return;
      cleanupReadiness();
      const fit = fitWorkspaceViewportToBounds(host, bounds, fitOptions);
      const transitionOwner = setWorkspaceSectionFitTransition(
        runtime,
        fit.duration,
      );
      void fit.transition.then(
        () => {
          settleWorkspaceSectionFitTransition(runtime, transitionOwner);
          settleWorkspaceSectionFitOperation(runtime, operation);
        },
        () => {
          settleWorkspaceSectionFitTransition(runtime, transitionOwner);
          settleWorkspaceSectionFitOperation(runtime, operation);
        },
      );
    } finally {
      attempting = false;
    }
  };
  attempt();
  return result;
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
  const targetSectionIds = getValidatedWorkspaceSectionIds(host, uniqueIds);
  if (!sectionIdsEqual(runtime.store.getState().sectionIds, targetSectionIds)) {
    runtime.store.setState({ sectionIds: targetSectionIds });
  }
}

export function resetWorkspaceSectionAttention(host: WorkspaceHost): void {
  const runtime = getWorkspaceSectionAttentionRuntime(host);
  cancelWorkspaceSectionFit(runtime);
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
