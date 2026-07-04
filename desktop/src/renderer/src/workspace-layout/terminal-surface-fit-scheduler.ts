export class TerminalSurfaceFitScheduler {
  private queuedFitFrame: number | null = null;
  private viewportResizeObserver: ResizeObserver | null = null;
  viewport: HTMLElement | null = null;

  constructor(private readonly fitAndResize: () => void) {}

  queue(): void {
    if (this.queuedFitFrame !== null) {
      return;
    }
    this.queuedFitFrame = window.setTimeout(() => {
      this.queuedFitFrame = null;
      this.fitAndResize();
    }, 0);
  }

  setViewport(viewport: HTMLElement | null): void {
    this.viewportResizeObserver?.disconnect();
    this.viewportResizeObserver = null;
    this.viewport = viewport;
    if (!viewport || typeof ResizeObserver === "undefined") {
      return;
    }
    this.viewportResizeObserver = new ResizeObserver(() => this.queue());
    this.viewportResizeObserver.observe(viewport);
  }

  clear(): void {
    if (this.queuedFitFrame !== null) {
      window.clearTimeout(this.queuedFitFrame);
      this.queuedFitFrame = null;
    }
  }
}

const warnedSmallTerminalViewports = new WeakSet<HTMLElement>();

export function terminalViewportHasSize(viewport: HTMLElement): boolean {
  const clientWidth = viewport.clientWidth;
  const clientHeight = viewport.clientHeight;
  if (typeof clientWidth === "number" && typeof clientHeight === "number") {
    return clientWidth > 0 && clientHeight > 0;
  }
  const rect = viewport.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    return true;
  }
  return typeof clientWidth !== "number" || typeof clientHeight !== "number";
}

export function warnIfTerminalViewportSuspiciouslySmall(viewport: HTMLElement): void {
  if (!import.meta.env.DEV || warnedSmallTerminalViewports.has(viewport)) {
    return;
  }
  const viewportHeight = elementHeight(viewport);
  const surface = viewport.parentElement;
  const paneHost = surface?.parentElement ?? null;
  const referenceHeight = Math.max(elementHeight(surface), elementHeight(paneHost));
  if (viewportHeight <= 0 || referenceHeight <= 0 || viewportHeight >= referenceHeight / 2) {
    return;
  }
  warnedSmallTerminalViewports.add(viewport);
  console.warn("Terminal viewport is unexpectedly small for its pane; fit may be content-sized.", {
    paneHeight: referenceHeight,
    viewportHeight,
  });
}

export function snapTerminalViewportToWholeRows(viewport: HTMLElement, rows: number): void {
  const terminalElement = viewport.querySelector<HTMLElement>(".xterm");
  const screen = terminalElement?.querySelector<HTMLElement>(".xterm-screen");
  if (!terminalElement || !screen || rows <= 0) {
    return;
  }
  const screenHeight = screen.getBoundingClientRect().height;
  const rowHeight = screenHeight / rows;
  if (!Number.isFinite(rowHeight) || rowHeight <= 0) {
    return;
  }
  terminalElement.style.setProperty("--workspace-xterm-snapped-height", `${rowHeight * rows}px`);
}

function elementHeight(element: Element | null): number {
  return element?.getBoundingClientRect().height ?? 0;
}
