/* @vitest-environment jsdom */

import { gpuFlowViewportStore } from "gpuFlow/viewportStore";
import type {
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
} from "react";
import { useMisc } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { setFileBrowserDragPayload } from "utils/fileBrowserDragPayload";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  handleProjectPaneClick,
  handleProjectPaneContextMenu,
  handleProjectPaneDragOver,
  handleProjectPaneDrop,
} from "./gpuProjectPaneEvents";

const mocks = vi.hoisted(() => ({
  addTemporaryNotification: vi.fn(),
  applyActiveSectionChange: vi.fn(),
  importNativeFileToWorkspace: vi.fn(),
  openFileAsSectionForDrop: vi.fn(),
  openPaneContextMenu: vi.fn(),
}));

vi.mock("state/actions/activeSectionController", () => ({
  applyActiveSectionChange: mocks.applyActiveSectionChange,
}));

vi.mock("state/actions/contextMenus", () => ({
  openPaneContextMenu: mocks.openPaneContextMenu,
}));

vi.mock("state/actions/notifications", () => ({
  addTemporaryNotification: mocks.addTemporaryNotification,
}));

vi.mock("state/actions/sections/createSections", () => ({
  openFileAsSectionForDrop: mocks.openFileAsSectionForDrop,
}));

vi.mock("utils/nativeFileImport", () => ({
  importNativeFileToWorkspace: mocks.importNativeFileToWorkspace,
}));

describe("GPU project pane event handlers", () => {
  beforeEach(() => {
    resetProjectStores();
    resetGpuViewport();
    mocks.openFileAsSectionForDrop.mockResolvedValue({
      sectionId: "section-from-drop",
      status: "opened",
    });
    mocks.importNativeFileToWorkspace.mockResolvedValue({
      fileName: "imported.txt",
      filePath: "/workspace/imported.txt",
      status: "ok",
    });
  });

  afterEach(() => {
    document.body.innerHTML = "";
    resetProjectStores();
    resetGpuViewport();
    vi.clearAllMocks();
  });

  it("handles background clicks through the pane owner", () => {
    const { root, surface } = createProjectPaneFixture();
    setViewportDomNode(root);
    gpuFlowViewportStore.getState().setNodesSelectionBounds({
      height: 40,
      width: 40,
      x: 1,
      y: 2,
    });

    handleProjectPaneClick(
      createMouseEvent(surface, { clientX: 130, clientY: 90 }),
    );

    expect(mocks.applyActiveSectionChange).toHaveBeenCalledWith({
      interaction: "pane-click",
    });
    expect(useMisc.getState().lastPaneClickLocation).toEqual({
      x: 10,
      y: 10,
    });
    expect(gpuFlowViewportStore.getState().nodesSelectionBounds).toBeNull();
  });

  it("ignores pane clicks from non-background targets", () => {
    const { root, surface } = createProjectPaneFixture();
    setViewportDomNode(root);
    const target = appendNestedTarget(surface, "setta-gpu-flow__node");
    const previousPaneClickLocation = useMisc.getState().lastPaneClickLocation;

    handleProjectPaneClick(
      createMouseEvent(target, { clientX: 130, clientY: 90 }),
    );

    expect(mocks.applyActiveSectionChange).not.toHaveBeenCalled();
    expect(useMisc.getState().lastPaneClickLocation).toEqual(
      previousPaneClickLocation,
    );
  });

  it("consumes the suppressed pane click after marquee selection", () => {
    const { root, surface } = createProjectPaneFixture();
    setViewportDomNode(root);
    const previousPaneClickLocation = useMisc.getState().lastPaneClickLocation;
    useMisc.setState({ suppressNextPaneClick: true });

    handleProjectPaneClick(
      createMouseEvent(surface, { clientX: 130, clientY: 90 }),
    );

    expect(mocks.applyActiveSectionChange).not.toHaveBeenCalled();
    expect(useMisc.getState().suppressNextPaneClick).toBe(false);
    expect(useMisc.getState().lastPaneClickLocation).toEqual(
      previousPaneClickLocation,
    );
  });

  it("opens pane context menus only from true background targets", () => {
    const { surface } = createProjectPaneFixture();
    const event = createMouseEvent(surface, { clientX: 40, clientY: 50 });

    handleProjectPaneContextMenu(false)(event);

    expect(mocks.openPaneContextMenu).toHaveBeenCalledWith(event);

    mocks.openPaneContextMenu.mockClear();
    const ignored = createMouseEvent(
      appendNestedTarget(surface, "setta-gpu-flow__handle"),
      { clientX: 40, clientY: 50 },
    );
    handleProjectPaneContextMenu(false)(ignored);

    expect(mocks.openPaneContextMenu).not.toHaveBeenCalled();
  });

  it("lets right-button pan settings own background context gestures", () => {
    const { surface } = createProjectPaneFixture();
    const event = createMouseEvent(surface, { clientX: 40, clientY: 50 });

    handleProjectPaneContextMenu([2])(event);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(mocks.openPaneContextMenu).not.toHaveBeenCalled();
  });

  it("accepts drag-over only for background file drops", () => {
    const { surface } = createProjectPaneFixture();
    const dataTransfer = createDataTransfer();
    setFileBrowserDragPayload(dataTransfer, {
      fullPath: "/workspace/input.py",
      name: "input.py",
      type: "file",
    });
    const event = createDragEvent(surface, { dataTransfer });

    handleProjectPaneDragOver(event);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(dataTransfer.dropEffect).toBe("copy");

    const ignoredDataTransfer = createDataTransfer();
    setFileBrowserDragPayload(ignoredDataTransfer, {
      fullPath: "/workspace/folder",
      name: "folder",
      type: "folder",
    });
    const ignored = createDragEvent(
      appendNestedTarget(surface, "section-resize-handle"),
      { dataTransfer: ignoredDataTransfer },
    );
    handleProjectPaneDragOver(ignored);

    expect(ignored.preventDefault).not.toHaveBeenCalled();
    expect(ignoredDataTransfer.dropEffect).toBe("none");
  });

  it("opens file-browser drops at the GPU flow position", () => {
    const { root, surface } = createProjectPaneFixture();
    setViewportDomNode(root);
    const dataTransfer = createDataTransfer();
    setFileBrowserDragPayload(dataTransfer, {
      fullPath: "/workspace/input.py",
      name: "input.py",
      type: "file",
    });
    const event = createDragEvent(surface, {
      clientX: 130,
      clientY: 90,
      dataTransfer,
    });

    handleProjectPaneDrop(event);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(mocks.openFileAsSectionForDrop).toHaveBeenCalledWith({
      fileName: "input.py",
      filePath: "/workspace/input.py",
      focusOnSection: false,
      position: { x: 10, y: 10 },
    });
  });

  it("imports native file drops before opening the imported workspace file", async () => {
    const { root, surface } = createProjectPaneFixture();
    setViewportDomNode(root);
    const file = new File(["hello"], "dropped.txt", { type: "text/plain" });
    const dataTransfer = createDataTransfer({ files: [file] });
    const event = createDragEvent(surface, {
      clientX: 130,
      clientY: 90,
      dataTransfer,
    });

    handleProjectPaneDrop(event);
    await flushMicrotasks();

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(mocks.importNativeFileToWorkspace).toHaveBeenCalledWith(file);
    expect(mocks.openFileAsSectionForDrop).toHaveBeenCalledWith({
      fileName: "imported.txt",
      filePath: "/workspace/imported.txt",
      focusOnSection: false,
      position: { x: 10, y: 10 },
    });
  });

  it("ignores drops from non-background targets", () => {
    const { root, surface } = createProjectPaneFixture();
    setViewportDomNode(root);
    const dataTransfer = createDataTransfer();
    setFileBrowserDragPayload(dataTransfer, {
      fullPath: "/workspace/input.py",
      name: "input.py",
      type: "file",
    });
    const event = createDragEvent(
      appendNestedTarget(surface, "setta-gpu-flow__node"),
      { clientX: 130, clientY: 90, dataTransfer },
    );

    handleProjectPaneDrop(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(mocks.openFileAsSectionForDrop).not.toHaveBeenCalled();
  });
});

function createProjectPaneFixture() {
  const root = document.createElement("div");
  root.className = "setta-gpu-flow-root";
  const gpuFlow = document.createElement("div");
  gpuFlow.className = "setta-gpu-flow setta-gpu-flow__pane";
  const surface = document.createElement("canvas");
  surface.dataset.gpuFlowSurface = "true";
  gpuFlow.append(surface);
  root.append(gpuFlow);
  document.body.append(root);
  return { gpuFlow, root, surface };
}

function appendNestedTarget(parent: Element, className: string) {
  const wrapper = document.createElement("div");
  wrapper.className = className;
  const target = document.createElement("button");
  wrapper.append(target);
  parent.append(wrapper);
  return target;
}

function createMouseEvent(
  target: EventTarget,
  options: {
    readonly clientX: number;
    readonly clientY: number;
  },
) {
  return {
    clientX: options.clientX,
    clientY: options.clientY,
    preventDefault: vi.fn(),
    target,
  } as unknown as ReactMouseEvent<HTMLDivElement>;
}

function createDragEvent(
  target: EventTarget,
  options: {
    readonly clientX?: number | undefined;
    readonly clientY?: number | undefined;
    readonly dataTransfer: DataTransfer;
  },
) {
  return {
    clientX: options.clientX ?? 0,
    clientY: options.clientY ?? 0,
    dataTransfer: options.dataTransfer,
    preventDefault: vi.fn(),
    target,
  } as unknown as ReactDragEvent<HTMLDivElement>;
}

function createDataTransfer({
  files = [],
}: {
  readonly files?: readonly File[] | undefined;
} = {}) {
  const data = new Map<string, string>();
  return {
    dropEffect: "none",
    files: createFileList(files),
    getData: vi.fn((type: string) => data.get(type) ?? ""),
    setData: vi.fn((type: string, value: string) => {
      data.set(type, value);
    }),
  } as unknown as DataTransfer;
}

function createFileList(files: readonly File[]) {
  const fileList = {
    length: files.length,
    item: (index: number) => files[index] ?? null,
  };
  files.forEach((file, index) => {
    Object.defineProperty(fileList, index, {
      configurable: true,
      value: file,
    });
  });
  return fileList as FileList;
}

function setViewportDomNode(element: HTMLElement) {
  element.getBoundingClientRect = () =>
    ({
      bottom: 620,
      height: 600,
      left: 10,
      right: 810,
      top: 20,
      width: 800,
      x: 10,
      y: 20,
      toJSON: () => "",
    }) as DOMRect;
  gpuFlowViewportStore.getState().setDomNode(element);
}

function resetGpuViewport() {
  const state = gpuFlowViewportStore.getState();
  state.setDomNode(null);
  state.setTransform([100, 50, 2]);
  state.setViewportSize({ height: 600, width: 800 });
  state.setZoomBounds({ defaultZoom: 1, maxZoom: 4, minZoom: 0.1 });
  state.setNodesSelectionBounds(null);
  state.resetUserSelection();
  state.setViewportInteractionFlags({
    nodeDragging: false,
    nodeResizing: false,
    paneDragging: false,
    panScrolling: false,
    pointerPanning: false,
    viewportAnimating: false,
    wheelZooming: false,
  });
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}
