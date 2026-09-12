import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWorkspaceHost, WorkspaceProvider } from "@setta/workspace";

import { DrawingSelectionInspector } from "./DrawingSelectionInspector";
import type { DrawingSelectionSnapshot } from "./drawingRuntime";
import {
  EMPTY_DRAWING_SELECTION_SNAPSHOT,
  registerDrawingSurface,
  type DrawingSurfaceController,
} from "./drawingSurfaceRegistry";

type ControllerHarness = {
  controller: DrawingSurfaceController;
  publish: (selection: DrawingSelectionSnapshot) => void;
};

function selectedSnapshot(
  patch: Partial<DrawingSelectionSnapshot> = {},
): DrawingSelectionSnapshot {
  return Object.freeze({
    ...EMPTY_DRAWING_SELECTION_SNAPSHOT,
    canClearSelection: true,
    canCopy: true,
    canDelete: true,
    canDuplicate: true,
    canLock: true,
    count: 1,
    fillColor: "#2563eb",
    fillEnabled: true,
    kind: "rectangle" as const,
    locked: false,
    opacity: 1,
    strokeColor: "#111827",
    strokeEnabled: true,
    strokeWidth: 2,
    supportsCornerRadius: true,
    supportsFill: true,
    supportsStroke: true,
    ...patch,
  });
}

function createControllerHarness(
  initialSelection: DrawingSelectionSnapshot,
): ControllerHarness {
  let selection = initialSelection;
  const subscribers = new Set<() => void>();
  const controller: DrawingSurfaceController = {
    alignSelection: vi.fn(() => true),
    bringSelectionForward: vi.fn(() => true),
    bringSelectionToFront: vi.fn(() => true),
    clearSelection: vi.fn(() => true),
    copySelection: vi.fn(() => true),
    deleteSelection: vi.fn(() => true),
    distributeSelection: vi.fn(() => true),
    duplicateSelection: vi.fn(async () => true),
    fitSectionToCanvas: vi.fn(() => true),
    getCanvasSize: () => ({ height: 320, width: 480 }),
    getGridOptions: () => ({ snapEnabled: false, visible: false }),
    getSelectionSnapshot: () => selection,
    groupSelection: vi.fn(() => true),
    nudgeSelection: vi.fn(() => true),
    pasteSelection: vi.fn(async () => true),
    resizeCanvas: vi.fn(() => true),
    selectAll: vi.fn(() => true),
    sendSelectionBackward: vi.fn(() => true),
    sendSelectionToBack: vi.fn(() => true),
    setSelectionAppearance: vi.fn(() => true),
    setSelectionTypography: vi.fn(() => true),
    setGridSnapEnabled: vi.fn(() => true),
    setGridVisible: vi.fn(() => true),
    subscribeSelection: (listener) => {
      subscribers.add(listener);
      return () => {
        subscribers.delete(listener);
      };
    },
    toggleSelectionLock: vi.fn(() => true),
    ungroupSelection: vi.fn(() => true),
  };
  return {
    controller,
    publish: (nextSelection) => {
      selection = nextSelection;
      for (const subscriber of [...subscribers]) {
        subscriber();
      }
    },
  };
}

function buttonWithText(
  container: HTMLElement,
  text: string,
): HTMLButtonElement {
  const button = [...container.querySelectorAll("button")].find(
    (candidate) => candidate.textContent?.trim() === text,
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Expected a ${text} button.`);
  }
  return button;
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

describe("drawing selection Inspector", () => {
  let container: HTMLDivElement;
  let root: Root;
  let unregisters: Array<() => void>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    unregisters = [];
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    for (const unregister of unregisters.reverse()) {
      unregister();
    }
    container.remove();
  });

  async function renderInspector(
    host: ReturnType<typeof createWorkspaceHost>,
  ): Promise<void> {
    await act(async () => {
      root.render(
        <WorkspaceProvider host={host}>
          <DrawingSelectionInspector sectionId="drawing-main" />
        </WorkspaceProvider>,
      );
    });
  }

  it("moves from unavailable to the empty selection instruction when the surface mounts", async () => {
    const host = createWorkspaceHost();
    await renderInspector(host);

    const panel = container.querySelector<HTMLElement>(
      '[aria-label="Drawing selection"]',
    )!;
    expect(panel.dataset.state).toBe("unavailable");
    expect(panel.textContent).toContain(
      "Expand the section to edit drawing objects.",
    );

    const harness = createControllerHarness(EMPTY_DRAWING_SELECTION_SNAPSHOT);
    await act(async () => {
      unregisters.push(
        registerDrawingSurface(host, "drawing-main", harness.controller),
      );
    });

    expect(panel.dataset.state).toBe("empty");
    expect(panel.textContent).toContain(
      "Select an object on the canvas to edit it.",
    );
  });

  it("shows only compatible controls and represents mixed values", async () => {
    const host = createWorkspaceHost();
    const mixedRectangle = selectedSnapshot({
      canAlign: true,
      canGroup: true,
      cornerRadius: "mixed",
      count: 2,
      fillColor: "mixed",
      fillEnabled: "mixed",
      kind: "mixed",
      opacity: "mixed",
      strokeColor: "mixed",
      strokeEnabled: "mixed",
      strokeWidth: "mixed",
    });
    const harness = createControllerHarness(mixedRectangle);
    unregisters.push(
      registerDrawingSurface(host, "drawing-main", harness.controller),
    );
    await renderInspector(host);

    const panel = container.querySelector<HTMLElement>(
      '[aria-label="Drawing selection"]',
    )!;
    expect(panel.textContent).toContain("2 selected · Mixed");
    expect(panel.textContent).toContain("Fill color (Mixed)");
    expect(
      container.querySelector<HTMLInputElement>('[aria-label="Fill enabled"]')
        ?.indeterminate,
    ).toBe(true);
    expect(
      container.querySelector<HTMLInputElement>('[aria-label="Fill color"]')
        ?.value,
    ).toBe("#2563eb");
    expect(
      container.querySelector<HTMLInputElement>('[aria-label="Stroke width"]')
        ?.placeholder,
    ).toBe("Mixed");
    expect(panel.textContent).toContain("Opacity (Mixed)");
    expect(panel.textContent).toContain("Corner radius (Mixed)");
    expect(container.querySelector('[aria-label="Font family"]')).toBeNull();

    await act(async () => {
      harness.publish(
        selectedSnapshot({
          cornerRadius: null,
          count: 2,
          fontFamily: "mixed",
          fontSize: "mixed",
          fontStyle: "mixed",
          fontWeight: "mixed",
          kind: "text",
          supportsCornerRadius: false,
          supportsTypography: true,
          textAlign: "mixed",
        }),
      );
    });

    expect(container.querySelector('[aria-label="Corner radius"]')).toBeNull();
    expect(
      container.querySelector<HTMLSelectElement>('[aria-label="Font family"]')
        ?.value,
    ).toBe("");
    expect(panel.textContent).toContain("Font family (Mixed)");
    expect(
      container
        .querySelector<HTMLButtonElement>('[aria-label="Bold, mixed"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("mixed");
    expect(
      container.querySelector('[aria-label="Text alignment"]')?.textContent,
    ).toContain("Mixed");
  });

  it("delegates compatible controls and disables unavailable capabilities", async () => {
    const host = createWorkspaceHost();
    const harness = createControllerHarness(
      selectedSnapshot({
        canAlign: false,
        canDelete: false,
        canDistribute: true,
        canGroup: false,
        canMoveBackward: false,
        canMoveForward: true,
        canUngroup: true,
        fontFamily: "Arial",
        fontSize: 18,
        fontStyle: "normal",
        fontWeight: "normal",
        kind: "text",
        locked: true,
        supportsCornerRadius: false,
        supportsTypography: true,
        textAlign: "left",
      }),
    );
    unregisters.push(
      registerDrawingSurface(host, "drawing-main", harness.controller),
    );
    await renderInspector(host);

    const bringForward = buttonWithText(container, "Bring forward");
    const bringToFront = buttonWithText(container, "Bring to front");
    const sendBackward = buttonWithText(container, "Send backward");
    const alignLeft = container.querySelector<HTMLButtonElement>(
      '[aria-label="Align left"]',
    )!;
    const distributeHorizontally = container.querySelector<HTMLButtonElement>(
      '[aria-label="Distribute horizontally"]',
    )!;
    const group = buttonWithText(container, "Group");
    const ungroup = buttonWithText(container, "Ungroup");
    const unlock = buttonWithText(container, "Unlock");
    const deleteButton = buttonWithText(container, "Delete");

    expect(bringForward.disabled).toBe(false);
    expect(bringToFront.disabled).toBe(false);
    expect(sendBackward.disabled).toBe(true);
    expect(alignLeft.disabled).toBe(true);
    expect(distributeHorizontally.disabled).toBe(false);
    expect(group.disabled).toBe(true);
    expect(ungroup.disabled).toBe(false);
    expect(unlock.disabled).toBe(false);
    expect(deleteButton.disabled).toBe(true);

    await act(async () => {
      container
        .querySelector<HTMLInputElement>('[aria-label="Fill enabled"]')!
        .click();
      changeSelect(
        container.querySelector<HTMLSelectElement>(
          '[aria-label="Font family"]',
        )!,
        "Georgia",
      );
      buttonWithText(container, "Bold").click();
      bringForward.click();
      sendBackward.click();
      alignLeft.click();
      distributeHorizontally.click();
      buttonWithText(container, "Duplicate").click();
      group.click();
      ungroup.click();
      unlock.click();
      deleteButton.click();
    });

    expect(harness.controller.setSelectionAppearance).toHaveBeenCalledWith({
      fill: null,
    });
    expect(harness.controller.setSelectionTypography).toHaveBeenCalledWith({
      fontFamily: "Georgia",
    });
    expect(harness.controller.setSelectionTypography).toHaveBeenCalledWith({
      fontWeight: "bold",
    });
    expect(harness.controller.bringSelectionForward).toHaveBeenCalledOnce();
    expect(harness.controller.sendSelectionBackward).not.toHaveBeenCalled();
    expect(harness.controller.alignSelection).not.toHaveBeenCalled();
    expect(harness.controller.distributeSelection).toHaveBeenCalledWith(
      "horizontal",
    );
    expect(harness.controller.duplicateSelection).toHaveBeenCalledOnce();
    expect(harness.controller.groupSelection).not.toHaveBeenCalled();
    expect(harness.controller.ungroupSelection).toHaveBeenCalledOnce();
    expect(harness.controller.toggleSelectionLock).toHaveBeenCalledOnce();
    expect(harness.controller.deleteSelection).not.toHaveBeenCalled();
  });
});
