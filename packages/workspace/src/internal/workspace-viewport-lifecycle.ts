import type { WorkspaceViewport } from "../core.js";

function assertViewport(viewport: WorkspaceViewport): void {
  if (
    !Number.isFinite(viewport.x) ||
    !Number.isFinite(viewport.y) ||
    !Number.isFinite(viewport.zoom) ||
    viewport.zoom <= 0
  ) {
    throw new TypeError("Workspace viewport must be finite with a positive zoom.");
  }
}

function copyViewport(viewport: WorkspaceViewport): WorkspaceViewport {
  return { x: viewport.x, y: viewport.y, zoom: viewport.zoom };
}

function viewportsMatch(first: WorkspaceViewport, second: WorkspaceViewport): boolean {
  return first.x === second.x && first.y === second.y && first.zoom === second.zoom;
}

export class WorkspaceViewportLifecycle {
  #baseline: WorkspaceViewport | null = null;
  #current: WorkspaceViewport;

  constructor(viewport: WorkspaceViewport) {
    assertViewport(viewport);
    this.#current = copyViewport(viewport);
  }

  begin(viewport: WorkspaceViewport): void {
    assertViewport(viewport);
    if (this.#baseline) {
      throw new Error("A workspace viewport gesture is already active.");
    }
    this.#baseline = copyViewport(this.#current);
    this.#current = copyViewport(viewport);
  }

  update(viewport: WorkspaceViewport): void {
    assertViewport(viewport);
    this.#current = copyViewport(viewport);
  }

  complete(viewport?: WorkspaceViewport): WorkspaceViewport | null {
    if (viewport) {
      this.update(viewport);
    }
    const baseline = this.#baseline;
    if (!baseline) {
      return null;
    }
    this.#baseline = null;
    return viewportsMatch(baseline, this.#current) ? null : copyViewport(this.#current);
  }

  cancel(): WorkspaceViewport | null {
    const baseline = this.#baseline;
    if (!baseline) {
      return null;
    }
    this.#baseline = null;
    this.#current = copyViewport(baseline);
    return copyViewport(baseline);
  }

  current(): WorkspaceViewport {
    return copyViewport(this.#current);
  }

  isActive(): boolean {
    return this.#baseline !== null;
  }

  synchronize(viewport: WorkspaceViewport): boolean {
    assertViewport(viewport);
    if (this.#baseline) {
      return false;
    }
    this.#current = copyViewport(viewport);
    return true;
  }
}
