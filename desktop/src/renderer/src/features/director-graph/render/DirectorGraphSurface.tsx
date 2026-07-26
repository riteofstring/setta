/**
 * The React mount point for the fullscreen graph.
 *
 * React owns exactly two things here: the elements and the lifecycle. Every
 * frame after mount is driven by `DirectorGraphCanvas`, which writes to the
 * canvas and to pooled label elements directly. Nothing in the frame loop sets
 * React state, so a provider burst cannot turn into a render storm.
 *
 * The surface takes no product state. It is handed a canvas host through
 * `onReady`, and whoever mounts it — the Phase 4 shell, or the fixture harness
 * today — decides what snapshots and batches to feed it.
 */

import { useEffect, useRef } from "react";

import { DirectorGraphCanvas } from "./director-graph-canvas";
import type { GraphViewport } from "./graph-view-state";

export interface DirectorGraphSurfaceProps {
  /**
   * Maps a monotonic frame timestamp onto the snapshot's committed-event time
   * base. The graph never invents a clock of its own.
   */
  timeSecondsAt: (timestampMs: number) => number;
  /** Receives the host once it exists, and again as null on unmount. */
  onReady: (canvas: DirectorGraphCanvas | null) => void;
  label: string;
  /** Keeps the background field moving after semantic graph motion settles. */
  ambientMotion?: boolean;
}

function prefersReducedMotion(view: Window): boolean {
  return view.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function DirectorGraphSurface({
  ambientMotion = false,
  timeSecondsAt,
  onReady,
  label,
}: DirectorGraphSurfaceProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef(timeSecondsAt);
  const readyRef = useRef(onReady);
  timeRef.current = timeSecondsAt;
  readyRef.current = onReady;

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const labelRoot = labelRef.current;
    if (root === null || canvas === null || labelRoot === null) {
      return;
    }
    const view = root.ownerDocument.defaultView;
    if (view === null) {
      throw new Error("director graph surface mounted outside a window");
    }
    const viewport: GraphViewport = { width: root.clientWidth, height: root.clientHeight };
    let width = viewport.width;
    let height = viewport.height;
    const host = new DirectorGraphCanvas({
      canvas,
      labelRoot,
      ownerDocument: root.ownerDocument,
      viewportOf: () => ({ width, height }),
      devicePixelRatioOf: () => view.devicePixelRatio,
      timeSecondsAt: (timestampMs) => timeRef.current(timestampMs),
      reducedMotion: prefersReducedMotion(view),
      ambientMotion,
    });
    readyRef.current(host);

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry === undefined) {
        return;
      }
      width = Math.max(1, Math.round(entry.contentRect.width));
      height = Math.max(1, Math.round(entry.contentRect.height));
      host.invalidate();
    });
    resizeObserver.observe(root);

    const motionQuery = view.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotionChange = (): void => host.setReducedMotion(motionQuery.matches);
    motionQuery.addEventListener("change", onMotionChange);

    const onVisibility = (): void =>
      host.setVisible(root.ownerDocument.visibilityState === "visible");
    root.ownerDocument.addEventListener("visibilitychange", onVisibility);

    const pointerPoint = (event: PointerEvent | MouseEvent) => {
      const bounds = canvas.getBoundingClientRect();
      return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    };
    const onPointerMove = (event: PointerEvent): void => host.pointerMoved(pointerPoint(event));
    const onPointerLeave = (): void => host.pointerLeft();
    const onClick = (event: MouseEvent): void => host.clicked(pointerPoint(event));
    const onWheel = (event: WheelEvent): void => host.wheeled(event.deltaY);
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        host.peekStep(1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        host.peekStep(-1);
      }
    };
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("wheel", onWheel, { passive: true });
    root.addEventListener("keydown", onKeyDown);
    host.setVisible(root.ownerDocument.visibilityState === "visible");

    return () => {
      resizeObserver.disconnect();
      motionQuery.removeEventListener("change", onMotionChange);
      root.ownerDocument.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("wheel", onWheel);
      root.removeEventListener("keydown", onKeyDown);
      readyRef.current(null);
      host.dispose();
    };
  }, [ambientMotion]);

  return (
    <div
      aria-label={label}
      className="director-graph-surface"
      ref={rootRef}
      role="region"
      tabIndex={0}
    >
      <canvas aria-hidden="true" className="director-graph-canvas" ref={canvasRef} />
      <div className="director-graph-labels" ref={labelRef} />
    </div>
  );
}
