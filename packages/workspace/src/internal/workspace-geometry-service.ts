import {
  clientPointToWorkspace,
  clientRectToWorkspace,
  workspacePointToClient,
  type GeometryRegistration,
  type MeasuredWorkspaceFrame,
  type ScreenPoint,
  type ScreenRect,
  type WorkspaceGeometryIndex,
  type WorkspacePoint,
  type WorkspaceRect,
} from "./geometry-index.js";
import type { ViewportTransform } from "./interaction-geometry.js";

export type MeasuredWorkspaceElement = Omit<MeasuredWorkspaceFrame, "rect"> & {
  element: HTMLElement;
};

type RegisteredMeasuredElement = MeasuredWorkspaceElement & {
  frame: MeasuredWorkspaceFrame | null;
  registration: GeometryRegistration | null;
  token: symbol;
};

type PendingBoundsRequest = {
  dispose(): void;
  reject(error: Error): void;
  sectionIds: ReadonlySet<string>;
};

type PendingViewportRequest = {
  reject(error: Error): void;
  resolve(synchronized: boolean): void;
  viewport: ViewportTransform;
};

type PendingFocusRequest = Readonly<{
  resolve(focused: boolean): void;
}>;

const SAME_FRAME_TOLERANCE = 0.01;

function screenRect(rect: DOMRect): ScreenRect {
  return { height: rect.height, width: rect.width, x: rect.x, y: rect.y };
}

function measuredFramesMatch(left: MeasuredWorkspaceFrame, right: MeasuredWorkspaceFrame): boolean {
  return (
    left.sectionId === right.sectionId &&
    left.parentSectionId === right.parentSectionId &&
    left.depth === right.depth &&
    left.order === right.order &&
    Math.abs(left.rect.x - right.rect.x) <= SAME_FRAME_TOLERANCE &&
    Math.abs(left.rect.y - right.rect.y) <= SAME_FRAME_TOLERANCE &&
    Math.abs(left.rect.width - right.rect.width) <= SAME_FRAME_TOLERANCE &&
    Math.abs(left.rect.height - right.rect.height) <= SAME_FRAME_TOLERANCE
  );
}

function assertViewport(viewport: ViewportTransform): void {
  if (
    !Number.isFinite(viewport.x) ||
    !Number.isFinite(viewport.y) ||
    !Number.isFinite(viewport.zoom) ||
    viewport.zoom <= 0
  ) {
    throw new TypeError("Workspace geometry viewport values must be finite with positive zoom.");
  }
}

function viewportsMatch(left: ViewportTransform, right: ViewportTransform): boolean {
  return (
    Math.abs(left.x - right.x) <= SAME_FRAME_TOLERANCE &&
    Math.abs(left.y - right.y) <= SAME_FRAME_TOLERANCE &&
    Math.abs(left.zoom - right.zoom) <= SAME_FRAME_TOLERANCE
  );
}

function hasMeaningfulActiveElement(ownerDocument: Document, excluded: Element): boolean {
  const activeElement = ownerDocument.activeElement;
  return Boolean(
    activeElement &&
    activeElement !== excluded &&
    activeElement !== ownerDocument.body &&
    activeElement !== ownerDocument.documentElement,
  );
}

async function waitForFocusReconciliation(
  ownerDocument: Document,
  focusAnchor: Element | null,
): Promise<void> {
  if (!focusAnchor?.isConnected || ownerDocument.activeElement !== focusAnchor) {
    return;
  }
  const view = ownerDocument.defaultView;
  if (!view) {
    await Promise.resolve();
    return;
  }
  await new Promise<void>((resolve) => view.requestAnimationFrame(() => resolve()));
}

export class WorkspaceGeometryMeasurements {
  readonly #entries = new Map<string, RegisteredMeasuredElement>();
  readonly #geometryIndex: WorkspaceGeometryIndex;
  readonly #pendingFocus = new Map<string, Set<PendingFocusRequest>>();
  readonly #pendingBounds = new Set<PendingBoundsRequest>();
  readonly #pendingViewports = new Set<PendingViewportRequest>();
  #canvasElement: HTMLElement | null = null;
  #frameRequest: number | null = null;
  #resizeObserver: ResizeObserver | null = null;
  #viewport: ViewportTransform;
  #window: Window | null = null;

  constructor(geometryIndex: WorkspaceGeometryIndex, viewport = { x: 0, y: 0, zoom: 1 }) {
    assertViewport(viewport);
    this.#geometryIndex = geometryIndex;
    this.#viewport = { ...viewport };
  }

  register(measuredElement: MeasuredWorkspaceElement): () => void {
    if (this.#entries.has(measuredElement.sectionId)) {
      throw new Error(`Section ${measuredElement.sectionId} already has measured DOM geometry.`);
    }
    const entry: RegisteredMeasuredElement = {
      ...measuredElement,
      frame: null,
      registration: null,
      token: Symbol(measuredElement.sectionId),
    };
    this.#entries.set(entry.sectionId, entry);
    this.#requireResizeObserver(entry.element).observe(entry.element);
    this.#settlePendingFocus(entry);
    this.requestMeasurement();

    return () => this.#unregister(entry);
  }

  setCanvasElement(element: HTMLElement | null): void {
    if (this.#canvasElement === element) {
      this.#releaseRepeatedDetach(element);
      return;
    }
    this.#removeCanvasListeners();
    this.#cancelScheduledMeasurement();
    this.#canvasElement = element;
    this.#window = element?.ownerDocument.defaultView ?? null;
    if (!element) {
      this.#releaseDetachedGeometry();
      return;
    }
    element.addEventListener("scroll", this.#onScroll, true);
    this.#window?.addEventListener("resize", this.#onResize);
    this.#measureAll();
  }

  setViewport(viewport: ViewportTransform): void {
    assertViewport(viewport);
    this.#viewport = { ...viewport };
    this.requestMeasurement();
  }

  completeViewport(viewport: ViewportTransform): void {
    this.setViewport(viewport);
    this.#settlePendingViewports();
  }

  async waitForViewport(viewport: ViewportTransform): Promise<boolean> {
    assertViewport(viewport);
    if (viewportsMatch(this.#viewport, viewport)) {
      return true;
    }
    return new Promise<boolean>((resolve, reject) => {
      this.#pendingViewports.add({ reject, resolve, viewport: { ...viewport } });
    });
  }

  requestMeasurement(): void {
    if (this.#frameRequest !== null || !this.#canvasElement || !this.#window) {
      return;
    }
    this.#frameRequest = this.#window.requestAnimationFrame(() => {
      this.#frameRequest = null;
      this.#measureAll();
    });
  }

  flushMeasurement(): void {
    this.#cancelScheduledMeasurement();
    this.#measureAll();
  }

  clientPointToWorkspace(point: ScreenPoint): WorkspacePoint {
    return clientPointToWorkspace(point, this.canvasBounds(), this.#viewport);
  }

  workspacePointToClient(point: WorkspacePoint): ScreenPoint {
    return workspacePointToClient(point, this.canvasBounds(), this.#viewport);
  }

  currentViewport(): ViewportTransform {
    return { ...this.#viewport };
  }

  canvasElement(): HTMLElement | null {
    return this.#canvasElement;
  }

  workspaceRect(sectionId: string): WorkspaceRect | undefined {
    return this.#geometryIndex.get(sectionId)?.rect;
  }

  visibleWorkspaceRect(): WorkspaceRect {
    const canvas = this.canvasBounds();
    return {
      height: canvas.height / this.#viewport.zoom,
      width: canvas.width / this.#viewport.zoom,
      x: -this.#viewport.x / this.#viewport.zoom,
      y: -this.#viewport.y / this.#viewport.zoom,
    };
  }

  canvasBounds(): ScreenRect {
    if (!this.#canvasElement) {
      throw new Error("Workspace canvas geometry is unavailable before mount or after unmount.");
    }
    return screenRect(this.#canvasElement.getBoundingClientRect());
  }

  async boundsWhenReady(sectionIds: readonly string[]): Promise<WorkspaceRect> {
    const uniqueSectionIds = [...new Set(sectionIds)];
    if (uniqueSectionIds.length === 0) {
      throw new TypeError("Workspace geometry bounds need at least one section.");
    }
    const unregisteredId = uniqueSectionIds.find((sectionId) => !this.#entries.has(sectionId));
    if (unregisteredId) {
      throw new Error(`Section ${unregisteredId} does not have a registered visible frame.`);
    }
    this.flushMeasurement();
    const available = this.#geometryIndex.boundsWhenReady(uniqueSectionIds);
    if (available) {
      return available;
    }

    return new Promise<WorkspaceRect>((resolve, reject) => {
      let unsubscribe: () => void = () => undefined;
      const request: PendingBoundsRequest = {
        dispose: () => unsubscribe(),
        reject,
        sectionIds: new Set(uniqueSectionIds),
      };
      unsubscribe = this.#geometryIndex.subscribe(() => {
        const bounds = this.#geometryIndex.boundsWhenReady(uniqueSectionIds);
        if (!bounds) {
          return;
        }
        unsubscribe();
        this.#pendingBounds.delete(request);
        resolve(bounds);
      });
      this.#pendingBounds.add(request);
      this.requestMeasurement();
    });
  }

  focusSection(sectionId: string): void {
    const entry = this.#entries.get(sectionId);
    if (!entry) {
      throw new Error(`Section ${sectionId} does not have a registered visible frame.`);
    }
    entry.element.focus({ preventScroll: true });
  }

  captureFocus(): Element | null {
    const canvas = this.#canvasElement;
    if (!canvas) {
      return null;
    }
    const ownerDocument = canvas.ownerDocument;
    const activeElement = ownerDocument.activeElement;
    return activeElement &&
      activeElement !== ownerDocument.body &&
      activeElement !== ownerDocument.documentElement
      ? activeElement
      : null;
  }

  async focusSectionWhenReady(sectionId: string): Promise<boolean> {
    const entry = this.#entries.get(sectionId);
    if (entry) {
      entry.element.focus({ preventScroll: true });
      return true;
    }
    return new Promise<boolean>((resolve) => {
      const requests = this.#pendingFocus.get(sectionId) ?? new Set<PendingFocusRequest>();
      requests.add({ resolve });
      this.#pendingFocus.set(sectionId, requests);
    });
  }

  async recoverFocus(sectionId: string | null, focusAnchor: Element | null): Promise<boolean> {
    const canvas = this.#canvasElement;
    if (!canvas) {
      return false;
    }
    const ownerDocument = canvas.ownerDocument;
    await waitForFocusReconciliation(ownerDocument, focusAnchor);
    if (this.#canvasElement !== canvas) {
      return false;
    }
    const activeElement = ownerDocument.activeElement;
    if (focusAnchor?.isConnected && activeElement === focusAnchor) {
      return false;
    }
    if (hasMeaningfulActiveElement(ownerDocument, canvas)) {
      return false;
    }
    if (sectionId) {
      return this.focusSectionWhenReady(sectionId);
    }
    canvas.focus({ preventScroll: true });
    return ownerDocument.activeElement === canvas;
  }

  #unregister(entry: RegisteredMeasuredElement): void {
    if (this.#entries.get(entry.sectionId)?.token !== entry.token) {
      return;
    }
    this.#resizeObserver?.unobserve(entry.element);
    entry.registration?.dispose();
    this.#entries.delete(entry.sectionId);
    this.#rejectPending(
      `Section ${entry.sectionId} was removed before its geometry became ready.`,
      entry.sectionId,
    );
    if (this.#entries.size === 0) {
      this.#resizeObserver?.disconnect();
      this.#resizeObserver = null;
    }
  }

  #cancelScheduledMeasurement(): void {
    if (this.#frameRequest !== null && this.#window) {
      this.#window.cancelAnimationFrame(this.#frameRequest);
      this.#frameRequest = null;
    }
  }

  #measureAll(): void {
    if (!this.#canvasElement || this.#entries.size === 0) {
      return;
    }
    const canvasBounds = screenRect(this.#canvasElement.getBoundingClientRect());
    for (const entry of this.#entries.values()) {
      this.#measure(entry, canvasBounds);
    }
  }

  #measure(entry: RegisteredMeasuredElement, canvasBounds: ScreenRect): void {
    const frame: MeasuredWorkspaceFrame = {
      depth: entry.depth,
      order: entry.order,
      parentSectionId: entry.parentSectionId,
      rect: clientRectToWorkspace(
        screenRect(entry.element.getBoundingClientRect()),
        canvasBounds,
        this.#viewport,
      ),
      sectionId: entry.sectionId,
    };
    if (entry.frame && measuredFramesMatch(entry.frame, frame)) {
      return;
    }
    if (entry.registration) {
      entry.registration.update(frame);
    } else {
      entry.registration = this.#geometryIndex.register(frame);
    }
    entry.frame = frame;
  }

  #releaseDetachedGeometry(): void {
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    for (const entry of this.#entries.values()) {
      entry.registration?.dispose();
    }
    this.#entries.clear();
    this.#settleDetachedFocus();
    this.#rejectPending("Workspace canvas geometry became unavailable before measurement.");
    this.#rejectPendingViewports(
      "Workspace canvas geometry became unavailable before the viewport synchronized.",
    );
  }

  #releaseRepeatedDetach(element: HTMLElement | null): void {
    if (!element) {
      this.#releaseDetachedGeometry();
    }
  }

  #removeCanvasListeners(): void {
    this.#canvasElement?.removeEventListener("scroll", this.#onScroll, true);
    this.#window?.removeEventListener("resize", this.#onResize);
  }

  #requireResizeObserver(element: HTMLElement): ResizeObserver {
    if (!this.#resizeObserver) {
      const ResizeObserverConstructor = element.ownerDocument.defaultView?.ResizeObserver;
      if (!ResizeObserverConstructor) {
        throw new Error("Workspace geometry requires ResizeObserver support.");
      }
      this.#resizeObserver = new ResizeObserverConstructor(() => this.requestMeasurement());
    }
    return this.#resizeObserver;
  }

  #rejectPending(message: string, sectionId?: string): void {
    for (const request of [...this.#pendingBounds]) {
      if (sectionId && !request.sectionIds.has(sectionId)) {
        continue;
      }
      this.#pendingBounds.delete(request);
      request.dispose();
      request.reject(new Error(message));
    }
  }

  #settlePendingViewports(): void {
    for (const request of [...this.#pendingViewports]) {
      this.#pendingViewports.delete(request);
      request.resolve(viewportsMatch(this.#viewport, request.viewport));
    }
  }

  #settlePendingFocus(entry: RegisteredMeasuredElement): void {
    const requests = this.#pendingFocus.get(entry.sectionId);
    if (!requests) {
      return;
    }
    this.#pendingFocus.delete(entry.sectionId);
    entry.element.focus({ preventScroll: true });
    for (const request of requests) {
      request.resolve(true);
    }
  }

  #settleDetachedFocus(): void {
    for (const requests of this.#pendingFocus.values()) {
      for (const request of requests) {
        request.resolve(false);
      }
    }
    this.#pendingFocus.clear();
  }

  #rejectPendingViewports(message: string): void {
    for (const request of this.#pendingViewports) {
      request.reject(new Error(message));
    }
    this.#pendingViewports.clear();
  }

  readonly #onResize = () => this.requestMeasurement();
  readonly #onScroll = () => this.requestMeasurement();
}
