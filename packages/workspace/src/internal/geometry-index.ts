import {
  screenPointToWorkspace,
  workspacePointToScreen,
  type InteractionPoint,
  type ViewportTransform,
} from "./interaction-geometry.js";

export type ScreenPoint = InteractionPoint;
export type WorkspacePoint = InteractionPoint;
export type ScreenRect = ScreenPoint & { width: number; height: number };
export type WorkspaceRect = WorkspacePoint & { width: number; height: number };

export type MeasuredWorkspaceFrame = {
  sectionId: string;
  parentSectionId: string | null;
  depth: number;
  order: number;
  rect: WorkspaceRect;
};

export type GeometryRegistration = {
  update(frame: MeasuredWorkspaceFrame): void;
  dispose(): void;
};

type GeometryEntry = {
  frame: MeasuredWorkspaceFrame;
  token: symbol;
};

function assertRect(rect: WorkspaceRect, sectionId: string): void {
  const values = [rect.x, rect.y, rect.width, rect.height];
  if (!values.every(Number.isFinite) || rect.width < 0 || rect.height < 0) {
    throw new Error(`Measured frame ${sectionId} must have finite non-negative geometry.`);
  }
}

function assertFrame(frame: MeasuredWorkspaceFrame): void {
  if (frame.sectionId.trim().length === 0) {
    throw new Error("Measured frame sectionId must not be empty.");
  }
  if (frame.parentSectionId === frame.sectionId) {
    throw new Error(`Measured frame ${frame.sectionId} cannot parent itself.`);
  }
  if (!Number.isInteger(frame.depth) || frame.depth < 0) {
    throw new Error(`Measured frame ${frame.sectionId} depth must be a non-negative integer.`);
  }
  if (!Number.isInteger(frame.order) || frame.order < 0) {
    throw new Error(`Measured frame ${frame.sectionId} order must be a non-negative integer.`);
  }

  assertRect(frame.rect, frame.sectionId);
}

function copyFrame(frame: MeasuredWorkspaceFrame): MeasuredWorkspaceFrame {
  return { ...frame, rect: { ...frame.rect } };
}

function compareFrames(a: MeasuredWorkspaceFrame, b: MeasuredWorkspaceFrame): number {
  return b.depth - a.depth || a.order - b.order || a.sectionId.localeCompare(b.sectionId);
}

export class WorkspaceGeometryIndex {
  readonly #childrenByParent = new Map<string | null, Set<string>>();
  readonly #entries = new Map<string, GeometryEntry>();
  readonly #listeners = new Set<() => void>();
  #revision = 0;

  get size(): number {
    return this.#entries.size;
  }

  get revision(): number {
    return this.#revision;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  register(frame: MeasuredWorkspaceFrame): GeometryRegistration {
    assertFrame(frame);
    const token = Symbol(frame.sectionId);
    this.#replace(frame.sectionId, { frame: copyFrame(frame), token });

    return {
      update: (nextFrame) => {
        const current = this.#entries.get(frame.sectionId);
        if (current?.token !== token) {
          throw new Error(`Geometry registration for ${frame.sectionId} is no longer active.`);
        }
        if (nextFrame.sectionId !== frame.sectionId) {
          throw new Error("A geometry registration cannot change its sectionId.");
        }
        assertFrame(nextFrame);
        this.#replace(frame.sectionId, { frame: copyFrame(nextFrame), token });
      },
      dispose: () => {
        const current = this.#entries.get(frame.sectionId);
        if (current?.token === token) {
          this.#remove(frame.sectionId, current.frame.parentSectionId);
        }
      },
    };
  }

  has(sectionId: string): boolean {
    return this.#entries.has(sectionId);
  }

  get(sectionId: string): MeasuredWorkspaceFrame | undefined {
    const frame = this.#entries.get(sectionId)?.frame;
    return frame ? copyFrame(frame) : undefined;
  }

  require(sectionId: string): MeasuredWorkspaceFrame {
    const frame = this.get(sectionId);
    if (!frame) {
      throw new Error(`Missing measured geometry for section ${sectionId}.`);
    }
    return frame;
  }

  directChildren(parentSectionId: string | null): readonly MeasuredWorkspaceFrame[] {
    return [...(this.#childrenByParent.get(parentSectionId) ?? [])]
      .map((sectionId) => this.#entries.get(sectionId)?.frame)
      .filter((frame): frame is MeasuredWorkspaceFrame => Boolean(frame))
      .sort((a, b) => a.order - b.order || a.sectionId.localeCompare(b.sectionId))
      .map(copyFrame);
  }

  framesAt(point: WorkspacePoint): readonly MeasuredWorkspaceFrame[] {
    return [...this.#entries.values()]
      .map(({ frame }) => frame)
      .filter(({ rect }) => {
        const withinX = point.x >= rect.x && point.x <= rect.x + rect.width;
        const withinY = point.y >= rect.y && point.y <= rect.y + rect.height;
        return withinX && withinY;
      })
      .sort(compareFrames)
      .map(copyFrame);
  }

  bounds(sectionIds: readonly string[]): WorkspaceRect {
    const frames = sectionIds.map((sectionId) => this.require(sectionId));
    const first = frames[0];
    if (!first) {
      throw new Error("Geometry bounds need at least one measured section.");
    }
    const left = Math.min(...frames.map(({ rect }) => rect.x));
    const top = Math.min(...frames.map(({ rect }) => rect.y));
    const right = Math.max(...frames.map(({ rect }) => rect.x + rect.width));
    const bottom = Math.max(...frames.map(({ rect }) => rect.y + rect.height));
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  snapshot(): readonly MeasuredWorkspaceFrame[] {
    return [...this.#entries.values()]
      .map(({ frame }) => frame)
      .sort(
        (a, b) => a.depth - b.depth || a.order - b.order || a.sectionId.localeCompare(b.sectionId),
      )
      .map(copyFrame);
  }

  #replace(sectionId: string, next: GeometryEntry): void {
    const previous = this.#entries.get(sectionId);
    if (previous) {
      this.#removeChild(previous.frame.parentSectionId, sectionId);
    }
    this.#entries.set(sectionId, next);
    this.#addChild(next.frame.parentSectionId, sectionId);
    this.#emit();
  }

  #remove(sectionId: string, parentSectionId: string | null): void {
    this.#entries.delete(sectionId);
    this.#removeChild(parentSectionId, sectionId);
    this.#emit();
  }

  #addChild(parentSectionId: string | null, sectionId: string): void {
    const children = this.#childrenByParent.get(parentSectionId) ?? new Set<string>();
    children.add(sectionId);
    this.#childrenByParent.set(parentSectionId, children);
  }

  #removeChild(parentSectionId: string | null, sectionId: string): void {
    const children = this.#childrenByParent.get(parentSectionId);
    children?.delete(sectionId);
    if (children?.size === 0) {
      this.#childrenByParent.delete(parentSectionId);
    }
  }

  #emit(): void {
    this.#revision += 1;
    for (const listener of this.#listeners) {
      listener();
    }
  }
}

export function clientPointToWorkspace(
  point: ScreenPoint,
  viewportBounds: ScreenRect,
  transform: ViewportTransform,
): WorkspacePoint {
  return screenPointToWorkspace(
    { x: point.x - viewportBounds.x, y: point.y - viewportBounds.y },
    transform,
  );
}

export function clientRectToWorkspace(
  rect: ScreenRect,
  viewportBounds: ScreenRect,
  transform: ViewportTransform,
): WorkspaceRect {
  const origin = clientPointToWorkspace(rect, viewportBounds, transform);
  return {
    ...origin,
    width: rect.width / transform.zoom,
    height: rect.height / transform.zoom,
  };
}

export function workspacePointToClient(
  point: WorkspacePoint,
  viewportBounds: ScreenRect,
  transform: ViewportTransform,
): ScreenPoint {
  const screenPoint = workspacePointToScreen(point, transform);
  return { x: screenPoint.x + viewportBounds.x, y: screenPoint.y + viewportBounds.y };
}

export function workspaceRectToClient(
  rect: WorkspaceRect,
  viewportBounds: ScreenRect,
  transform: ViewportTransform,
): ScreenRect {
  const screenPoint = workspacePointToScreen(rect, transform);
  return {
    x: screenPoint.x + viewportBounds.x,
    y: screenPoint.y + viewportBounds.y,
    width: rect.width * transform.zoom,
    height: rect.height * transform.zoom,
  };
}
