import {
  useCallback,
  useSyncExternalStore,
  type CSSProperties,
  type FocusEvent,
  type ReactElement,
  type ReactNode,
  type RefCallback,
  type RefObject,
} from "react";

import type { WorkspaceParentLookup } from "../core.js";
import { optionOverridesAt } from "./runtime-option-validation.js";
import type { WorkspaceGeometryMeasurements } from "./workspace-geometry-service.js";

export type WorkspaceViewportCullingOptions = Readonly<{
  enabled?: boolean;
  overscan?: number;
}>;

export type ResolvedWorkspaceViewportCullingOptions = Readonly<{
  enabled: boolean;
  overscan: number;
}>;

type WorkspaceCullingSize = Readonly<{ height: number; width: number }>;

type WorkspaceCullingSnapshot = Readonly<{
  render: boolean;
  size: WorkspaceCullingSize | null;
}>;

type WorkspaceCullingRegistration = Readonly<{
  element: HTMLElement;
  measureSize(): WorkspaceCullingSize;
  sectionId: string;
}>;

type ObservedWorkspaceSection = WorkspaceCullingRegistration &
  Readonly<{
    token: symbol;
  }>;

const DEFAULT_VIEWPORT_CULLING_OPTIONS: ResolvedWorkspaceViewportCullingOptions = Object.freeze({
  enabled: false,
  overscan: 160,
});
const INITIAL_CULLING_SNAPSHOT: WorkspaceCullingSnapshot = Object.freeze({
  render: true,
  size: null,
});
const viewportCullingOptionKeys = ["enabled", "overscan"] as const;

function resolvedEnabled(value: unknown): boolean {
  if (value === undefined) {
    return DEFAULT_VIEWPORT_CULLING_OPTIONS.enabled;
  }
  if (typeof value !== "boolean") {
    throw new TypeError("Workspace viewport culling enabled must be a boolean.");
  }
  return value;
}

function resolvedOverscan(value: unknown): number {
  if (value === undefined) {
    return DEFAULT_VIEWPORT_CULLING_OPTIONS.overscan;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new TypeError(
      "Workspace viewport culling overscan must be a finite non-negative number.",
    );
  }
  return value;
}

export function resolveWorkspaceViewportCullingOptions(
  value: WorkspaceViewportCullingOptions | undefined,
): ResolvedWorkspaceViewportCullingOptions {
  const options = optionOverridesAt(
    value,
    viewportCullingOptionKeys,
    "Workspace viewport culling options",
    "workspace viewport culling option",
  );
  return Object.freeze({
    enabled: resolvedEnabled(options.enabled),
    overscan: resolvedOverscan(options.overscan),
  });
}

function snapshotsMatch(left: WorkspaceCullingSnapshot, right: WorkspaceCullingSnapshot): boolean {
  return (
    left.render === right.render &&
    left.size?.height === right.size?.height &&
    left.size?.width === right.size?.width
  );
}

function rootMargin(overscan: number): string {
  return `${String(overscan)}px`;
}

export class WorkspaceViewportCulling {
  readonly #forcedSectionCounts = new Map<string, number>();
  readonly #focusedSectionIds = new Set<string>();
  readonly #listeners = new Map<string, Set<() => void>>();
  readonly #observedByElement = new Map<Element, ObservedWorkspaceSection>();
  readonly #observedBySection = new Map<string, ObservedWorkspaceSection>();
  readonly #snapshots = new Map<string, WorkspaceCullingSnapshot>();
  #canvasElement: HTMLElement | null = null;
  #observer: IntersectionObserver | null = null;
  #options = DEFAULT_VIEWPORT_CULLING_OPTIONS;
  #parentLookup: WorkspaceParentLookup = new Map();

  setOptions(options: ResolvedWorkspaceViewportCullingOptions): void {
    if (options.enabled === this.#options.enabled && options.overscan === this.#options.overscan) {
      return;
    }
    this.#options = options;
    this.#reconnectObserver();
  }

  setParentLookup(parentLookup: WorkspaceParentLookup): void {
    this.#parentLookup = parentLookup;
  }

  setCanvasElement(element: HTMLElement | null): void {
    if (this.#canvasElement === element) {
      return;
    }
    this.#canvasElement = element;
    this.#reconnectObserver();
  }

  register(registration: WorkspaceCullingRegistration): () => void {
    if (this.#observedBySection.has(registration.sectionId)) {
      throw new Error(
        `Workspace viewport culling already observes section ${registration.sectionId}.`,
      );
    }
    const observed = { ...registration, token: Symbol(registration.sectionId) };
    this.#observedByElement.set(observed.element, observed);
    this.#observedBySection.set(observed.sectionId, observed);
    this.#setSnapshot(observed.sectionId, INITIAL_CULLING_SNAPSHOT);
    this.#observer?.observe(observed.element);
    return () => this.#unregister(observed);
  }

  subscribe(sectionId: string, listener: () => void): () => void {
    const listeners = this.#listeners.get(sectionId) ?? new Set<() => void>();
    listeners.add(listener);
    this.#listeners.set(sectionId, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.#listeners.delete(sectionId);
      }
    };
  }

  snapshot(sectionId: string): WorkspaceCullingSnapshot {
    return this.#snapshots.get(sectionId) ?? INITIAL_CULLING_SNAPSHOT;
  }

  setSectionFocusWithin(sectionId: string, focusWithin: boolean): void {
    if (focusWithin === this.#focusedSectionIds.has(sectionId)) {
      return;
    }
    if (focusWithin) {
      this.#focusedSectionIds.add(sectionId);
    } else {
      this.#focusedSectionIds.delete(sectionId);
    }
    this.#refreshSnapshot(sectionId);
  }

  readonly revealSection = (sectionId: string): (() => void) => {
    const revealedIds = this.#sectionPath(sectionId);
    for (const revealedId of revealedIds) {
      const count = this.#forcedSectionCounts.get(revealedId) ?? 0;
      this.#forcedSectionCounts.set(revealedId, count + 1);
      if (count === 0) {
        this.#refreshSnapshot(revealedId);
      }
    }
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      for (const revealedId of revealedIds) {
        const count = this.#forcedSectionCounts.get(revealedId);
        if (!count) {
          continue;
        }
        if (count === 1) {
          this.#forcedSectionCounts.delete(revealedId);
          this.#refreshSnapshot(revealedId);
        } else {
          this.#forcedSectionCounts.set(revealedId, count - 1);
        }
      }
    };
  };

  #sectionPath(sectionId: string): readonly string[] {
    const path: string[] = [];
    const visited = new Set<string>();
    let currentSectionId: string | null | undefined = sectionId;
    while (currentSectionId) {
      if (visited.has(currentSectionId)) {
        throw new Error(`Workspace viewport culling found a parent cycle at ${currentSectionId}.`);
      }
      visited.add(currentSectionId);
      path.push(currentSectionId);
      currentSectionId = this.#parentLookup.get(currentSectionId);
    }
    return path;
  }

  #reconnectObserver(): void {
    this.#observer?.disconnect();
    this.#observer = null;
    if (!this.#options.enabled || !this.#canvasElement) {
      for (const sectionId of this.#observedBySection.keys()) {
        this.#setSnapshot(sectionId, INITIAL_CULLING_SNAPSHOT);
      }
      return;
    }
    const IntersectionObserverConstructor =
      this.#canvasElement.ownerDocument.defaultView?.IntersectionObserver;
    if (!IntersectionObserverConstructor) {
      throw new Error("Workspace viewport culling requires IntersectionObserver support.");
    }
    this.#observer = new IntersectionObserverConstructor(this.#handleIntersections, {
      root: this.#canvasElement,
      rootMargin: rootMargin(this.#options.overscan),
    });
    for (const observed of this.#observedBySection.values()) {
      this.#setSnapshot(observed.sectionId, INITIAL_CULLING_SNAPSHOT);
      this.#observer.observe(observed.element);
    }
  }

  readonly #handleIntersections: IntersectionObserverCallback = (entries) => {
    for (const entry of entries) {
      const observed = this.#observedByElement.get(entry.target);
      if (!observed) {
        continue;
      }
      const baseSnapshot: WorkspaceCullingSnapshot = entry.isIntersecting
        ? INITIAL_CULLING_SNAPSHOT
        : Object.freeze({ render: false, size: Object.freeze(observed.measureSize()) });
      this.#setSnapshot(observed.sectionId, this.#forcedSnapshot(observed.sectionId, baseSnapshot));
    }
  };

  #forcedSnapshot(sectionId: string, snapshot: WorkspaceCullingSnapshot): WorkspaceCullingSnapshot {
    const forceRender =
      (this.#forcedSectionCounts.get(sectionId) ?? 0) > 0 || this.#focusedSectionIds.has(sectionId);
    return forceRender && !snapshot.render
      ? Object.freeze({ ...snapshot, render: true })
      : snapshot;
  }

  #refreshSnapshot(sectionId: string): void {
    const current = this.#snapshots.get(sectionId);
    if (!current) {
      return;
    }
    const baseSnapshot =
      current.size && !current.render
        ? current
        : current.size
          ? Object.freeze({ ...current, render: false })
          : INITIAL_CULLING_SNAPSHOT;
    this.#setSnapshot(sectionId, this.#forcedSnapshot(sectionId, baseSnapshot));
  }

  #setSnapshot(sectionId: string, snapshot: WorkspaceCullingSnapshot): void {
    const current = this.#snapshots.get(sectionId);
    if (current && snapshotsMatch(current, snapshot)) {
      return;
    }
    this.#snapshots.set(sectionId, snapshot);
    for (const listener of this.#listeners.get(sectionId) ?? []) {
      listener();
    }
  }

  #unregister(observed: ObservedWorkspaceSection): void {
    if (this.#observedBySection.get(observed.sectionId)?.token !== observed.token) {
      return;
    }
    this.#observer?.unobserve(observed.element);
    this.#observedByElement.delete(observed.element);
    this.#observedBySection.delete(observed.sectionId);
    this.#focusedSectionIds.delete(observed.sectionId);
    this.#snapshots.delete(observed.sectionId);
  }
}

export function renderWorkspaceCulledSectionFrame({
  depth,
  headingId,
  onBlurCapture,
  onFocusCapture,
  parentSectionId,
  registerElement,
  sectionId,
  style,
  title,
}: Readonly<{
  depth: number;
  headingId: string;
  onBlurCapture(event: FocusEvent<HTMLElement>): void;
  onFocusCapture(): void;
  parentSectionId: string | null;
  registerElement: RefCallback<HTMLElement>;
  sectionId: string;
  style: CSSProperties;
  title: string;
}>): ReactElement {
  const statusId = `${headingId}-culling-status`;
  return (
    <article
      aria-describedby={statusId}
      aria-labelledby={headingId}
      className={`setta-workspace__section-frame setta-workspace__section-frame--culled ${depth === 0 ? "setta-workspace__root-shell" : "setta-workspace__nested-shell"}`}
      data-workspace-culled="true"
      data-workspace-depth={depth}
      data-workspace-parent-section-id={parentSectionId ?? undefined}
      data-workspace-section-id={sectionId}
      onBlurCapture={onBlurCapture}
      onFocusCapture={onFocusCapture}
      ref={registerElement}
      style={style}
      tabIndex={-1}
    >
      <h2 className="setta-workspace__visually-hidden" id={headingId}>
        {title}
      </h2>
      <span className="setta-workspace__visually-hidden" id={statusId}>
        This section is outside the rendered viewport. Focus or pan to it to restore its controls
        and content.
      </span>
    </article>
  );
}

function measuredSectionSize(
  element: HTMLElement,
  geometry: WorkspaceGeometryMeasurements,
  sectionId: string,
): WorkspaceCullingSize {
  const measured = geometry.workspaceRect(sectionId);
  if (measured) {
    return { height: measured.height, width: measured.width };
  }
  const bounds = element.getBoundingClientRect();
  const zoom = geometry.currentViewport().zoom;
  return { height: bounds.height / zoom, width: bounds.width / zoom };
}

export function registerWorkspaceSectionCullingFrame({
  depth,
  element,
  frameElementRef,
  geometry,
  order,
  parentSectionId,
  sectionDndElementRef,
  sectionId,
  viewportCulling,
}: Readonly<{
  depth: number;
  element: HTMLElement | null;
  frameElementRef: RefObject<HTMLElement | null>;
  geometry: WorkspaceGeometryMeasurements;
  order: number;
  parentSectionId: string | null;
  sectionDndElementRef(element: HTMLElement | null): void;
  sectionId: string;
  viewportCulling: WorkspaceViewportCulling;
}>): (() => void) | undefined {
  if (!element) {
    return;
  }
  frameElementRef.current = element;
  sectionDndElementRef(element);
  const unregisterGeometry = geometry.register({
    depth,
    element,
    order,
    parentSectionId,
    sectionId,
  });
  const unregisterCulling = viewportCulling.register({
    element,
    measureSize: () => measuredSectionSize(element, geometry, sectionId),
    sectionId,
  });
  return () => {
    unregisterCulling();
    unregisterGeometry();
  };
}

export function workspaceSectionCullingPinned(
  detached: boolean,
  moving: boolean,
  resizing: boolean,
  structuralMoving: boolean,
  editingTitle: boolean,
  presentationOpen: boolean,
): boolean {
  return detached || moving || resizing || structuralMoving || editingTitle || presentationOpen;
}

export function optionalWorkspaceCullingSize(
  size: WorkspaceCullingSize | null,
): WorkspaceCullingSize | undefined {
  return size ?? undefined;
}

export function WorkspaceSectionCullingSurface({
  children,
  culled,
  culledFrameProps,
  size,
}: Readonly<{
  children: ReactNode;
  culled: boolean;
  culledFrameProps: Parameters<typeof renderWorkspaceCulledSectionFrame>[0];
  size: WorkspaceCullingSize | null;
}>) {
  return culled && size ? renderWorkspaceCulledSectionFrame(culledFrameProps) : children;
}

export function useWorkspaceSectionCulling(
  culling: WorkspaceViewportCulling,
  sectionId: string,
  pinned: boolean,
) {
  const subscribe = useCallback(
    (listener: () => void) => culling.subscribe(sectionId, listener),
    [culling, sectionId],
  );
  const getSnapshot = useCallback(() => culling.snapshot(sectionId), [culling, sectionId]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => INITIAL_CULLING_SNAPSHOT);
  const handleFocusCapture = useCallback(
    () => culling.setSectionFocusWithin(sectionId, true),
    [culling, sectionId],
  );
  const handleBlurCapture = useCallback(
    (event: FocusEvent<HTMLElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
        culling.setSectionFocusWithin(sectionId, false);
      }
    },
    [culling, sectionId],
  );
  return {
    culled: !snapshot.render && !pinned,
    handleBlurCapture,
    handleFocusCapture,
    size: snapshot.size,
  };
}
