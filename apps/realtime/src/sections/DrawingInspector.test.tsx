import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWorkspaceHost, WorkspaceProvider } from "@setta/workspace";

import { DrawingInspector } from "./DrawingInspector";
import {
  EMPTY_DRAWING_SELECTION_SNAPSHOT,
  registerDrawingSurface,
  type DrawingSurfaceController,
} from "./drawingSurfaceRegistry";

function drawingSurfaceController(
  canvas: Pick<
    DrawingSurfaceController,
    | "fitSectionToCanvas"
    | "getCanvasSize"
    | "getGridOptions"
    | "resizeCanvas"
    | "setGridSnapEnabled"
    | "setGridVisible"
  >,
): DrawingSurfaceController {
  return {
    alignSelection: () => false,
    bringSelectionForward: () => false,
    bringSelectionToFront: () => false,
    clearSelection: () => false,
    copySelection: () => false,
    deleteSelection: () => false,
    distributeSelection: () => false,
    duplicateSelection: async () => false,
    getSelectionSnapshot: () => EMPTY_DRAWING_SELECTION_SNAPSHOT,
    groupSelection: () => false,
    nudgeSelection: () => false,
    pasteSelection: async () => false,
    selectAll: () => false,
    sendSelectionBackward: () => false,
    sendSelectionToBack: () => false,
    setSelectionAppearance: () => false,
    setSelectionTypography: () => false,
    subscribeSelection: () => () => {},
    toggleSelectionLock: () => false,
    ungroupSelection: () => false,
    ...canvas,
  };
}

function changeInput(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  if (setter === undefined) {
    throw new Error("Expected the native input value setter.");
  }
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function changeSelect(select: HTMLSelectElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value",
  )?.set;
  if (setter === undefined) {
    throw new Error("Expected the native select value setter.");
  }
  setter.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("drawing Inspector", () => {
  const host = createWorkspaceHost();
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("applies linked canvas dimensions and fits the section on demand", async () => {
    const resizeCanvas = vi.fn(() => true);
    const fitSectionToCanvas = vi.fn(() => true);
    const setGridSnapEnabled = vi.fn(() => true);
    const setGridVisible = vi.fn(() => true);
    const unregister = registerDrawingSurface(
      host,
      "drawing-main",
      drawingSurfaceController({
        fitSectionToCanvas,
        getCanvasSize: () => ({ height: 320, width: 480 }),
        getGridOptions: () => ({ snapEnabled: false, visible: false }),
        resizeCanvas,
        setGridSnapEnabled,
        setGridVisible,
      }),
    );
    await act(async () => {
      root.render(
        <WorkspaceProvider host={host}>
          <DrawingInspector
            data={{
              background: "#ffffff",
              height: 320,
              scene: { objects: [], version: "7.4.0" },
              width: 480,
            }}
            isMinimized={false}
            positionAndSizeLocked={false}
            sectionId="drawing-main"
          />
        </WorkspaceProvider>,
      );
    });

    expect(
      container.querySelector<HTMLElement>('[aria-label="Drawing selection"]')
        ?.dataset.state,
    ).toBe("empty");
    const canvasGroup = [...container.querySelectorAll("details")].find(
      (details) =>
        details.querySelector("summary > span")?.textContent === "Canvas",
    );
    expect(canvasGroup?.open).toBe(false);
    expect(canvasGroup?.querySelector("summary")?.textContent).toContain(
      "480 × 320 px",
    );
    await act(async () => canvasGroup?.querySelector("summary")?.click());
    expect(canvasGroup?.open).toBe(true);

    const artworkBehavior = container.querySelector<HTMLSelectElement>(
      '[aria-label="Artwork behavior"]',
    )!;
    expect(
      container.querySelector('[aria-label="Center anchor"]'),
    ).not.toBeNull();
    await act(async () => changeSelect(artworkBehavior, "scale-artwork"));
    expect(container.querySelector('[aria-label="Center anchor"]')).toBeNull();
    await act(async () => changeSelect(artworkBehavior, "keep-artwork"));

    await act(async () => {
      container
        .querySelector<HTMLInputElement>('[aria-label="Show grid"]')!
        .click();
      container
        .querySelector<HTMLInputElement>('[aria-label="Snap objects to grid"]')!
        .click();
    });
    expect(setGridVisible).toHaveBeenCalledWith(true);
    expect(setGridSnapEnabled).toHaveBeenCalledWith(true);

    const width = container.querySelector<HTMLInputElement>(
      '[aria-label="Canvas width"]',
    )!;
    const height = container.querySelector<HTMLInputElement>(
      '[aria-label="Canvas height"]',
    )!;
    await act(async () => {
      changeInput(width, "960");
    });
    expect(height.value).toBe("640");

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Bottom right anchor"]')!
        .click();
    });
    expect(
      container
        .querySelector<HTMLButtonElement>("[data-apply-canvas-size]")!
        .classList.contains("setta-workspace-inspector-primary-action"),
    ).toBe(true);
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>("[data-apply-canvas-size]")!
        .click();
    });
    expect(resizeCanvas).toHaveBeenCalledWith({
      anchor: "bottom-right",
      height: 640,
      mode: "keep-artwork",
      width: 960,
    });

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>("[data-fit-frame-to-canvas]")!
        .click();
    });
    expect(fitSectionToCanvas).toHaveBeenCalledOnce();
    await act(async () => unregister());
  });

  it("rejects canvas dimensions outside the persisted contract", async () => {
    const resizeCanvas = vi.fn(() => true);
    const unregister = registerDrawingSurface(
      host,
      "drawing-main",
      drawingSurfaceController({
        fitSectionToCanvas: () => true,
        getCanvasSize: () => ({ height: 320, width: 480 }),
        getGridOptions: () => ({ snapEnabled: false, visible: false }),
        resizeCanvas,
        setGridSnapEnabled: () => true,
        setGridVisible: () => true,
      }),
    );
    await act(async () => {
      root.render(
        <WorkspaceProvider host={host}>
          <DrawingInspector
            data={{
              background: "#ffffff",
              height: 320,
              scene: { objects: [], version: "7.4.0" },
              width: 480,
            }}
            isMinimized={false}
            positionAndSizeLocked={false}
            sectionId="drawing-main"
          />
        </WorkspaceProvider>,
      );
    });

    const width = container.querySelector<HTMLInputElement>(
      '[aria-label="Canvas width"]',
    )!;
    await act(async () => {
      changeInput(width, "9000");
    });
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>("[data-apply-canvas-size]")!
        .click();
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "between 1 and 8192",
    );
    expect(resizeCanvas).not.toHaveBeenCalled();
    await act(async () => unregister());
  });
});
