import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ArtifactAnnotation,
  type ArtifactAnnotationProps,
} from "./ArtifactAnnotation";

type PointerEventName =
  "pointercancel" | "pointerdown" | "pointermove" | "pointerup";

function dispatchPointer(
  target: Element,
  type: PointerEventName,
  {
    button = 0,
    clientX,
    clientY,
    isPrimary = true,
    pointerId = 7,
  }: {
    button?: number;
    clientX: number;
    clientY: number;
    isPrimary?: boolean;
    pointerId?: number;
  },
): Event {
  const event = new MouseEvent(type, {
    bubbles: true,
    button,
    cancelable: true,
    clientX,
    clientY,
  });
  Object.defineProperties(event, {
    isPrimary: { value: isPrimary },
    pointerId: { value: pointerId },
  });
  act(() => target.dispatchEvent(event));
  return event;
}

function dispatchKey(target: Element, key: string): Event {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    key,
  });
  act(() => target.dispatchEvent(event));
  return event;
}

function configureSurface(surface: SVGSVGElement) {
  const capturedPointers = new Set<number>();
  const setPointerCapture = vi.fn((pointerId: number) => {
    capturedPointers.add(pointerId);
  });
  const releasePointerCapture = vi.fn((pointerId: number) => {
    capturedPointers.delete(pointerId);
  });
  Object.assign(surface, {
    hasPointerCapture: (pointerId: number) => capturedPointers.has(pointerId),
    releasePointerCapture,
    setPointerCapture,
  });
  vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({
    bottom: 120,
    height: 100,
    left: 10,
    right: 210,
    toJSON: () => ({}),
    top: 20,
    width: 200,
    x: 10,
    y: 20,
  });
  return { releasePointerCapture, setPointerCapture };
}

describe("ArtifactAnnotation", () => {
  let container: HTMLDivElement;
  let root: Root;
  let onClear: ArtifactAnnotationProps["onClear"];
  let onStrokeComplete: ArtifactAnnotationProps["onStrokeComplete"];

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
    overrides: Partial<ArtifactAnnotationProps> = {},
  ): SVGSVGElement {
    const props: ArtifactAnnotationProps = {
      artifactId: "artifact-a",
      artifactLabel: "Candidate A",
      drawMode: true,
      onClear,
      onStrokeComplete,
      strokes: [],
      ...overrides,
    };
    act(() => root.render(<ArtifactAnnotation {...props} />));
    const surface = container.querySelector<SVGSVGElement>("svg");
    if (!surface) {
      throw new Error("The annotation canvas did not render.");
    }
    return surface;
  }

  it("renders existing strokes and settles one normalized captured stroke", () => {
    const surface = render({
      strokes: [
        {
          id: "existing-stroke",
          points: [
            { x: 0.2, y: 0.3 },
            { x: 0.4, y: 0.7 },
          ],
        },
      ],
    });
    const capture = configureSurface(surface);

    expect(
      container
        .querySelector('[data-annotation-stroke="existing-stroke"]')
        ?.getAttribute("d"),
    ).toBe("M 0.2 0.3 L 0.4 0.7");

    dispatchPointer(surface, "pointerdown", { clientX: 30, clientY: 30 });
    dispatchPointer(surface, "pointermove", { clientX: 110, clientY: 70 });
    dispatchPointer(surface, "pointerup", { clientX: 210, clientY: 120 });

    expect(capture.setPointerCapture).toHaveBeenCalledTimes(1);
    expect(capture.setPointerCapture).toHaveBeenCalledWith(7);
    expect(capture.releasePointerCapture).toHaveBeenCalledTimes(1);
    expect(capture.releasePointerCapture).toHaveBeenCalledWith(7);
    expect(onStrokeComplete).toHaveBeenCalledTimes(1);
    expect(onStrokeComplete).toHaveBeenCalledWith("artifact-a", [
      { x: 0.1, y: 0.1 },
      { x: 0.5, y: 0.5 },
      { x: 1, y: 1 },
    ]);
    expect(container.querySelector("[data-annotation-draft]")).toBeNull();
  });

  it("does not settle a tap or draw while drawing mode is off", () => {
    const activeSurface = render();
    configureSurface(activeSurface);
    dispatchPointer(activeSurface, "pointerdown", {
      clientX: 30,
      clientY: 30,
    });
    dispatchPointer(activeSurface, "pointerup", { clientX: 30, clientY: 30 });

    expect(onStrokeComplete).not.toHaveBeenCalled();

    const inactiveSurface = render({ drawMode: false });
    const capture = configureSurface(inactiveSurface);
    dispatchPointer(inactiveSurface, "pointerdown", {
      clientX: 30,
      clientY: 30,
    });

    expect(capture.setPointerCapture).not.toHaveBeenCalled();
    expect(inactiveSurface.tabIndex).toBe(-1);
    expect(inactiveSurface.getAttribute("aria-disabled")).toBe("true");
  });

  it("cancels the draft when the pointer is canceled", () => {
    const surface = render();
    const capture = configureSurface(surface);
    dispatchPointer(surface, "pointerdown", { clientX: 30, clientY: 30 });
    dispatchPointer(surface, "pointermove", { clientX: 110, clientY: 70 });
    dispatchPointer(surface, "pointercancel", { clientX: 110, clientY: 70 });

    expect(capture.releasePointerCapture).toHaveBeenCalledTimes(1);
    expect(capture.releasePointerCapture).toHaveBeenCalledWith(7);
    expect(onStrokeComplete).not.toHaveBeenCalled();
    expect(container.querySelector("[data-annotation-draft]")).toBeNull();
  });

  it("cancels the draft when the selected artifact or draw mode changes", () => {
    const surface = render();
    const capture = configureSurface(surface);
    dispatchPointer(surface, "pointerdown", { clientX: 30, clientY: 30 });
    dispatchPointer(surface, "pointermove", { clientX: 110, clientY: 70 });

    render({ artifactId: "artifact-b", artifactLabel: "Candidate B" });

    expect(capture.releasePointerCapture).toHaveBeenCalledTimes(1);
    expect(capture.releasePointerCapture).toHaveBeenCalledWith(7);
    expect(onStrokeComplete).not.toHaveBeenCalled();
    expect(container.querySelector("[data-annotation-draft]")).toBeNull();

    const nextSurface = container.querySelector<SVGSVGElement>("svg");
    if (!nextSurface) {
      throw new Error("The annotation canvas disappeared.");
    }
    const nextCapture = configureSurface(nextSurface);
    dispatchPointer(nextSurface, "pointerdown", {
      clientX: 30,
      clientY: 30,
    });
    dispatchPointer(nextSurface, "pointermove", {
      clientX: 110,
      clientY: 70,
    });

    render({
      artifactId: "artifact-b",
      artifactLabel: "Candidate B",
      drawMode: false,
    });

    expect(nextCapture.releasePointerCapture).toHaveBeenCalledTimes(1);
    expect(nextCapture.releasePointerCapture).toHaveBeenCalledWith(7);
    expect(onStrokeComplete).not.toHaveBeenCalled();
  });

  it("exposes stable instructions and keyboard cancel and clear actions", () => {
    const surface = render({
      strokes: [
        {
          id: "existing-stroke",
          points: [
            { x: 0.2, y: 0.3 },
            { x: 0.4, y: 0.7 },
          ],
        },
      ],
    });
    const capture = configureSurface(surface);

    expect(surface.getAttribute("role")).toBe("img");
    expect(surface.getAttribute("aria-label")).toBe(
      "Annotation canvas for Candidate A",
    );
    expect(surface.getAttribute("aria-keyshortcuts")).toBe(
      "Escape Delete Backspace",
    );

    dispatchPointer(surface, "pointerdown", { clientX: 30, clientY: 30 });
    dispatchPointer(surface, "pointermove", { clientX: 110, clientY: 70 });
    expect(dispatchKey(surface, "Escape").defaultPrevented).toBe(true);

    expect(capture.releasePointerCapture).toHaveBeenCalledTimes(1);
    expect(capture.releasePointerCapture).toHaveBeenCalledWith(7);
    expect(onStrokeComplete).not.toHaveBeenCalled();
    expect(dispatchKey(surface, "Delete").defaultPrevented).toBe(true);
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onClear).toHaveBeenCalledWith("artifact-a");
  });

  it("cancels a captured draft when it unmounts", () => {
    const surface = render();
    const capture = configureSurface(surface);
    dispatchPointer(surface, "pointerdown", { clientX: 30, clientY: 30 });
    dispatchPointer(surface, "pointermove", { clientX: 110, clientY: 70 });

    act(() => root.render(<div />));

    expect(capture.releasePointerCapture).toHaveBeenCalledTimes(1);
    expect(capture.releasePointerCapture).toHaveBeenCalledWith(7);
    expect(onStrokeComplete).not.toHaveBeenCalled();
  });
});
