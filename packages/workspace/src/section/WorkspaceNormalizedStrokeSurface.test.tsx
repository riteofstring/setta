/* @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  WorkspaceNormalizedStrokeSurface,
  type WorkspaceNormalizedStrokeSurfaceProps,
} from "./WorkspaceNormalizedStrokeSurface";

function dispatchPointer(
  target: SVGSVGElement,
  type: "pointercancel" | "pointerdown" | "pointermove" | "pointerup",
  clientX: number,
  clientY: number,
  isPrimary = true,
): Event {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    cancelable: true,
    clientX,
    clientY,
  });
  Object.defineProperties(event, {
    isPrimary: { value: isPrimary },
    pointerId: { value: 7 },
  });
  act(() => target.dispatchEvent(event));
  return event;
}

function prepareSurface(surface: SVGSVGElement) {
  const captured = new Set<number>();
  const releasePointerCapture = vi.fn((pointerId: number) => {
    captured.delete(pointerId);
  });
  const setPointerCapture = vi.fn((pointerId: number) => {
    captured.add(pointerId);
  });
  Object.assign(surface, {
    hasPointerCapture: (pointerId: number) => captured.has(pointerId),
    releasePointerCapture,
    setPointerCapture,
  });
  vi.spyOn(surface, "getBoundingClientRect").mockReturnValue(
    new DOMRect(10, 20, 200, 100),
  );
  return { releasePointerCapture, setPointerCapture };
}

describe("WorkspaceNormalizedStrokeSurface", () => {
  let container: HTMLDivElement;
  let root: Root;
  let onClear: () => void;
  let onStrokeComplete: WorkspaceNormalizedStrokeSurfaceProps["onStrokeComplete"];

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    onClear = vi.fn();
    onStrokeComplete = vi.fn();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render(
    overrides: Partial<WorkspaceNormalizedStrokeSurfaceProps> = {},
  ): SVGSVGElement {
    act(() => {
      root.render(
        <WorkspaceNormalizedStrokeSurface
          ariaLabel="Draw evidence annotation"
          enabled
          onClear={onClear}
          onStrokeComplete={onStrokeComplete}
          strokes={[]}
          {...overrides}
        />,
      );
    });
    const surface = container.querySelector<SVGSVGElement>(
      '[data-workspace-normalized-stroke-surface="true"]',
    );
    if (!surface) throw new Error("Expected a normalized stroke surface.");
    return surface;
  }

  it("renders committed paths and settles a normalized captured stroke", () => {
    const surface = render({
      strokes: [
        {
          id: "existing",
          points: [
            { x: 0.2, y: 0.3 },
            { x: 0.4, y: 0.7 },
          ],
        },
      ],
    });
    const capture = prepareSurface(surface);

    expect(
      container
        .querySelector('[data-workspace-normalized-stroke="existing"]')
        ?.getAttribute("d"),
    ).toBe("M 0.2 0.3 L 0.4 0.7");
    dispatchPointer(surface, "pointerdown", 30, 30);
    dispatchPointer(surface, "pointermove", 110, 70);
    dispatchPointer(surface, "pointerup", 230, 140);

    expect(capture.setPointerCapture).toHaveBeenCalledWith(7);
    expect(capture.releasePointerCapture).toHaveBeenCalledWith(7);
    expect(onStrokeComplete).toHaveBeenCalledWith([
      { x: 0.1, y: 0.1 },
      { x: 0.5, y: 0.5 },
      { x: 1, y: 1 },
    ]);
    expect(
      container.querySelector(
        '[data-workspace-normalized-stroke-draft="true"]',
      ),
    ).toBeNull();
  });

  it("rejects taps, non-primary starts, and starts outside the surface", () => {
    const surface = render();
    const capture = prepareSurface(surface);

    dispatchPointer(surface, "pointerdown", 30, 30);
    dispatchPointer(surface, "pointerup", 30, 30);
    dispatchPointer(surface, "pointerdown", 30, 30, false);
    dispatchPointer(surface, "pointerdown", 9, 70);

    expect(onStrokeComplete).not.toHaveBeenCalled();
    expect(capture.setPointerCapture).toHaveBeenCalledOnce();
  });

  it("cancels captured drafts on Escape, pointer cancellation, reset, and unmount", () => {
    const surface = render({ resetKey: "first" });
    const capture = prepareSurface(surface);
    dispatchPointer(surface, "pointerdown", 30, 30);
    dispatchPointer(surface, "pointermove", 110, 70);
    act(() => {
      surface.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Escape",
        }),
      );
    });

    dispatchPointer(surface, "pointerdown", 30, 30);
    dispatchPointer(surface, "pointercancel", 30, 30);
    dispatchPointer(surface, "pointerdown", 30, 30);
    render({ resetKey: "second" });
    const nextSurface = container.querySelector<SVGSVGElement>("svg");
    if (!nextSurface) throw new Error("Expected the surface after reset.");
    prepareSurface(nextSurface);
    dispatchPointer(nextSurface, "pointerdown", 30, 30);
    act(() => root.render(<div />));

    expect(capture.releasePointerCapture).toHaveBeenCalledTimes(3);
    expect(onStrokeComplete).not.toHaveBeenCalled();
  });

  it("stays passive while disabled and exposes keyboard clearing while enabled", () => {
    const disabled = render({ enabled: false });
    const capture = prepareSurface(disabled);
    dispatchPointer(disabled, "pointerdown", 30, 30);

    expect(capture.setPointerCapture).not.toHaveBeenCalled();
    expect(disabled.style.pointerEvents).toBe("none");
    expect(disabled.tabIndex).toBe(-1);

    const enabled = render({
      strokes: [
        {
          id: "existing",
          points: [
            { x: 0.2, y: 0.3 },
            { x: 0.4, y: 0.7 },
          ],
        },
      ],
    });
    act(() => {
      enabled.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Delete",
        }),
      );
    });

    expect(onClear).toHaveBeenCalledOnce();
  });
});
