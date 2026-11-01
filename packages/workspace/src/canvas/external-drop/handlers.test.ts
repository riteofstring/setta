import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
} from "../../../test/workspaceTestHost.js";
import { attachWorkspaceExternalDropHandlers } from "./handlers.js";
import type { WorkspaceExternalDropConfiguration } from "./types.js";

type DragEventOptions = {
  clientX?: number;
  clientY?: number;
  currentTarget: HTMLDivElement;
  dataTransfer: DataTransfer;
  target: EventTarget;
};

function createDataTransfer(
  dropEffect: DataTransfer["dropEffect"] = "none",
): DataTransfer {
  return { dropEffect } as unknown as DataTransfer;
}

function createDragEvent({
  clientX = 0,
  clientY = 0,
  currentTarget,
  dataTransfer,
  target,
}: DragEventOptions): DragEvent {
  return {
    clientX,
    clientY,
    currentTarget,
    dataTransfer,
    preventDefault: vi.fn(),
    target,
  } as unknown as DragEvent;
}

function createConfiguration(
  canDrop: WorkspaceExternalDropConfiguration["canDrop"] = () => true,
  onDrop: WorkspaceExternalDropConfiguration["onDrop"] = () => undefined,
): WorkspaceExternalDropConfiguration {
  return { canDrop, onDrop };
}

function attachHandlers(
  workspace: WorkspaceTestHost,
  configuration: WorkspaceExternalDropConfiguration,
) {
  const listeners = new Map<string, (event: DragEvent) => void>();
  const addEventListener = vi.fn((type: string, listener: unknown) => {
    listeners.set(type, listener as (event: DragEvent) => void);
  });
  const removeEventListener = vi.fn();
  const pane = {
    addEventListener,
    removeEventListener,
  } as unknown as HTMLDivElement;
  const detach = attachWorkspaceExternalDropHandlers(
    workspace.host,
    pane,
    configuration,
  );
  const onDragOver = listeners.get("dragover");
  const onDrop = listeners.get("drop");
  if (!onDragOver || !onDrop) {
    throw new Error(
      "Workspace external drop did not attach both pane listeners.",
    );
  }
  return {
    addEventListener,
    detach,
    onDragOver,
    onDrop,
    pane,
    removeEventListener,
  };
}

function setScreenPosition(
  workspace: WorkspaceTestHost,
  rectangle: { x: number; y: number },
  transform: [number, number, number],
) {
  const getBoundingClientRect = vi.fn(() => rectangle);
  workspace.reactFlow.setState({
    domNode: { getBoundingClientRect } as unknown as HTMLDivElement,
    transform,
  });
  workspace.options.setState({ snapToGrid: false });
  return getBoundingClientRect;
}

let workspace: WorkspaceTestHost;

beforeEach(() => {
  workspace = createWorkspaceTestHost();
});

afterEach(() => {
  workspace.host.dispose();
});

describe("Workspace external drop handlers", () => {
  it("accepts an eligible bare-pane drag with the original transfer and copy cursor", () => {
    const dataTransfer = createDataTransfer("move");
    const canDrop = vi.fn(() => true);
    const onDrop = vi.fn();
    const handlers = attachHandlers(
      workspace,
      createConfiguration(canDrop, onDrop),
    );
    const event = createDragEvent({
      currentTarget: handlers.pane,
      dataTransfer,
      target: handlers.pane,
    });

    handlers.onDragOver(event);

    expect(canDrop).toHaveBeenCalledTimes(1);
    expect(canDrop).toHaveBeenCalledWith(dataTransfer);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(dataTransfer.dropEffect).toBe("copy");
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("leaves a rejected bare-pane drag untouched", () => {
    const dataTransfer = createDataTransfer("move");
    const canDrop = vi.fn(() => false);
    const handlers = attachHandlers(workspace, createConfiguration(canDrop));
    const event = createDragEvent({
      currentTarget: handlers.pane,
      dataTransfer,
      target: handlers.pane,
    });

    handlers.onDragOver(event);

    expect(canDrop).toHaveBeenCalledTimes(1);
    expect(canDrop).toHaveBeenCalledWith(dataTransfer);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(dataTransfer.dropEffect).toBe("move");
  });

  it("leaves a rejected bare-pane drop untouched", () => {
    const dataTransfer = createDataTransfer();
    const canDrop = vi.fn(() => false);
    const onDrop = vi.fn();
    const getBoundingClientRect = setScreenPosition(
      workspace,
      { x: 100, y: 50 },
      [20, 30, 2],
    );
    const handlers = attachHandlers(
      workspace,
      createConfiguration(canDrop, onDrop),
    );
    const event = createDragEvent({
      clientX: 200,
      clientY: 160,
      currentTarget: handlers.pane,
      dataTransfer,
      target: handlers.pane,
    });

    handlers.onDrop(event);

    expect(canDrop).toHaveBeenCalledTimes(1);
    expect(canDrop).toHaveBeenCalledWith(dataTransfer);
    expect(getBoundingClientRect).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("leaves descendants to their existing drag owner", () => {
    const descendant = {} as HTMLElement;
    const dataTransfer = createDataTransfer();
    const canDrop = vi.fn(() => true);
    const onDrop = vi.fn();
    const handlers = attachHandlers(
      workspace,
      createConfiguration(canDrop, onDrop),
    );
    const dragOver = createDragEvent({
      currentTarget: handlers.pane,
      dataTransfer,
      target: descendant,
    });
    const drop = createDragEvent({
      clientX: 200,
      clientY: 160,
      currentTarget: handlers.pane,
      dataTransfer,
      target: descendant,
    });

    handlers.onDragOver(dragOver);
    handlers.onDrop(drop);

    expect(canDrop).not.toHaveBeenCalled();
    expect(dragOver.preventDefault).not.toHaveBeenCalled();
    expect(drop.preventDefault).not.toHaveBeenCalled();
    expect(onDrop).not.toHaveBeenCalled();
    expect(dataTransfer.dropEffect).toBe("none");
  });

  it("converts a bare-pane drop once and preserves browser object identity", () => {
    const dataTransfer = createDataTransfer();
    const canDrop = vi.fn(() => true);
    const onDrop = vi.fn();
    const getBoundingClientRect = setScreenPosition(
      workspace,
      { x: 100, y: 50 },
      [20, 30, 2],
    );
    const handlers = attachHandlers(
      workspace,
      createConfiguration(canDrop, onDrop),
    );
    const event = createDragEvent({
      clientX: 200,
      clientY: 160,
      currentTarget: handlers.pane,
      dataTransfer,
      target: handlers.pane,
    });

    handlers.onDrop(event);

    expect(getBoundingClientRect).toHaveBeenCalledTimes(1);
    expect(canDrop).toHaveBeenCalledTimes(1);
    expect(canDrop).toHaveBeenCalledWith(dataTransfer);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onDrop).toHaveBeenCalledWith(dataTransfer, { x: 40, y: 40 }, event);
  });

  it("keeps handlers and coordinates isolated by host", () => {
    const otherWorkspace = createWorkspaceTestHost();
    try {
      const firstTransfer = createDataTransfer();
      const secondTransfer = createDataTransfer();
      const firstOnDrop = vi.fn();
      const secondOnDrop = vi.fn();
      setScreenPosition(workspace, { x: 10, y: 20 }, [0, 0, 1]);
      setScreenPosition(otherWorkspace, { x: 20, y: 30 }, [10, 10, 2]);
      const firstHandlers = attachHandlers(
        workspace,
        createConfiguration(() => true, firstOnDrop),
      );
      const secondHandlers = attachHandlers(
        otherWorkspace,
        createConfiguration(() => true, secondOnDrop),
      );

      const firstEvent = createDragEvent({
        clientX: 30,
        clientY: 50,
        currentTarget: firstHandlers.pane,
        dataTransfer: firstTransfer,
        target: firstHandlers.pane,
      });
      const secondEvent = createDragEvent({
        clientX: 60,
        clientY: 90,
        currentTarget: secondHandlers.pane,
        dataTransfer: secondTransfer,
        target: secondHandlers.pane,
      });
      firstHandlers.onDrop(firstEvent);
      secondHandlers.onDrop(secondEvent);

      expect(firstOnDrop).toHaveBeenCalledWith(
        firstTransfer,
        { x: 20, y: 30 },
        firstEvent,
      );
      expect(secondOnDrop).toHaveBeenCalledWith(
        secondTransfer,
        { x: 15, y: 25 },
        secondEvent,
      );
      expect(firstOnDrop).toHaveBeenCalledTimes(1);
      expect(secondOnDrop).toHaveBeenCalledTimes(1);
    } finally {
      otherWorkspace.host.dispose();
    }
  });

  it("validates both callbacks before exposing handlers", () => {
    const canDrop = vi.fn(() => true);
    const pane = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLElement;

    expect(() =>
      attachWorkspaceExternalDropHandlers(workspace.host, pane, {
        canDrop,
        onDrop: null,
      } as unknown as WorkspaceExternalDropConfiguration),
    ).toThrow(
      "Workspace external drop configuration requires canDrop and onDrop callbacks.",
    );
    expect(canDrop).not.toHaveBeenCalled();
  });

  it("attaches and removes only the pane drag listeners", () => {
    const handlers = attachHandlers(workspace, createConfiguration());
    handlers.detach();

    expect(handlers.addEventListener).toHaveBeenNthCalledWith(
      1,
      "dragover",
      handlers.onDragOver,
    );
    expect(handlers.addEventListener).toHaveBeenNthCalledWith(
      2,
      "drop",
      handlers.onDrop,
    );
    expect(handlers.removeEventListener).toHaveBeenNthCalledWith(
      1,
      "dragover",
      handlers.onDragOver,
    );
    expect(handlers.removeEventListener).toHaveBeenNthCalledWith(
      2,
      "drop",
      handlers.onDrop,
    );
  });
});
