/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const renderCalls = vi.hoisted(() => ({
  dragDropProvider: vi.fn(({ children }: { children: React.ReactNode }) => (
    <div data-testid="drag-drop-provider">{children}</div>
  )),
  dragOperationShapeSync: vi.fn(() => (
    <div data-testid="drag-operation-shape-sync" />
  )),
  paramDndMonitor: vi.fn(() => <div data-testid="param-dnd-monitor" />),
  paramDragOverlay: vi.fn(() => <div data-testid="param-drag-overlay" />),
  useMisc: vi.fn(() => false),
  useShareCapabilities: vi.fn(() => ({
    canEditStructure: true,
  })),
  useParamDndState: vi.fn(() => false),
  useParamDndSensors: vi.fn(() => "sensors"),
}));

vi.mock("components/Params/ParamDndMonitor", () => ({
  ParamDndMonitor: renderCalls.paramDndMonitor,
  ParamDragOverlay: renderCalls.paramDragOverlay,
}));

vi.mock("forks/dnd-kit/adapter", () => ({
  DragDropProvider: renderCalls.dragDropProvider,
}));

vi.mock("state/definitions", () => ({
  useMisc: renderCalls.useMisc,
}));

vi.mock("state/hooks/share", () => ({
  useShareCapabilities: renderCalls.useShareCapabilities,
}));

vi.mock("./DragOperationShapeSync", () => ({
  DragOperationShapeSync: renderCalls.dragOperationShapeSync,
}));

vi.mock("./paramDndChildren", () => ({
  useParamDndChildren: {
    getState: () => ({
      y: {},
    }),
  },
}));

vi.mock("./paramDndState", () => ({
  useParamDndState: renderCalls.useParamDndState,
}));

vi.mock("./useDNDSensors", () => ({
  useParamDndSensors: renderCalls.useParamDndSensors,
}));

const { ParamDndContext } = await import("./ParamDndContext");

describe("ParamDndContext", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    renderCalls.dragDropProvider.mockClear();
    renderCalls.dragOperationShapeSync.mockClear();
    renderCalls.paramDndMonitor.mockClear();
    renderCalls.paramDragOverlay.mockClear();
    renderCalls.useMisc.mockReset();
    renderCalls.useMisc.mockReturnValue(false);
    renderCalls.useShareCapabilities.mockReset();
    renderCalls.useShareCapabilities.mockReturnValue({
      canEditStructure: true,
    });
    renderCalls.useParamDndState.mockReset();
    renderCalls.useParamDndState.mockReturnValue(false);
    renderCalls.useParamDndSensors.mockClear();
    renderCalls.useParamDndSensors.mockReturnValue("sensors");
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    document.body.innerHTML = "";
  });

  it("bypasses the drag provider stack when parameter dragging is inactive", async () => {
    await act(async () => {
      root.render(
        <ParamDndContext>
          <div data-testid="child">child</div>
        </ParamDndContext>,
      );
    });

    expect(host.querySelector('[data-testid="child"]')?.textContent).toBe(
      "child",
    );
    expect(host.querySelector('[data-testid="drag-drop-provider"]')).toBeNull();
    expect(renderCalls.dragDropProvider).not.toHaveBeenCalled();
    expect(renderCalls.useParamDndSensors).not.toHaveBeenCalled();
    expect(renderCalls.dragOperationShapeSync).not.toHaveBeenCalled();
    expect(renderCalls.paramDndMonitor).not.toHaveBeenCalled();
    expect(renderCalls.paramDragOverlay).not.toHaveBeenCalled();
  });

  it("mounts the existing drag provider stack while parameter selection is active", async () => {
    renderCalls.useMisc.mockReturnValue(true);

    await act(async () => {
      root.render(
        <ParamDndContext>
          <div data-testid="child">child</div>
        </ParamDndContext>,
      );
    });

    expect(
      host.querySelector('[data-testid="drag-drop-provider"]'),
    ).not.toBeNull();
    expect(renderCalls.dragDropProvider).toHaveBeenCalledTimes(1);
    expect(renderCalls.useParamDndSensors).toHaveBeenCalledTimes(1);
    expect(renderCalls.dragOperationShapeSync).toHaveBeenCalledTimes(1);
    expect(renderCalls.paramDndMonitor).toHaveBeenCalledTimes(1);
    expect(renderCalls.paramDragOverlay).toHaveBeenCalledTimes(1);
  });

  it("keeps the drag provider stack mounted while a drag reset is still pending", async () => {
    renderCalls.useParamDndState.mockReturnValue(true);

    await act(async () => {
      root.render(
        <ParamDndContext>
          <div data-testid="child">child</div>
        </ParamDndContext>,
      );
    });

    expect(
      host.querySelector('[data-testid="drag-drop-provider"]'),
    ).not.toBeNull();
    expect(renderCalls.dragDropProvider).toHaveBeenCalledTimes(1);
    expect(renderCalls.useParamDndSensors).toHaveBeenCalledTimes(1);
  });
});
