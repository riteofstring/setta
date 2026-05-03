/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import {
  clearGpuNodeTargetingCache,
  createGpuNodeTargetDescriptor,
  isGpuNodeInteractiveEventTarget,
  resolveGpuNodePointerHandoffTarget,
  resolveGpuNodeTargetDescriptor,
  resolveGpuNodeWheelHandoffTarget,
} from "./activeNodeTargeting";
import type { GpuNodeLayout } from "./htmlSurfaces/frame";
import type { HtmlSurfaceTextureRecord } from "./htmlSurfaces/textures";
import { createHtmlSurfaceVisualScene } from "./htmlSurfaces/visualScene";

describe("gpu active node pointer targeting", () => {
  it("resolves the topmost node control at a canvas client point", () => {
    const surface = document.createElement("div");
    const lowerNode = createNodeElement("lower");
    const upperNode = createNodeElement("upper");
    const lowerButton = document.createElement("button");
    const upperButton = document.createElement("button");
    lowerButton.dataset.gpuFlowControl = "lower-run";
    upperButton.dataset.gpuFlowControl = "upper-run";
    lowerButton.textContent = "Run lower";
    upperButton.textContent = "Run upper";
    lowerNode.append(lowerButton);
    upperNode.append(upperButton);
    setRect(surface, 100, 50, 500, 400);
    setRect(lowerButton, 20, 20, 40, 20);
    setRect(upperButton, 20, 20, 40, 20);

    const target = resolveGpuNodePointerHandoffTarget({
      clientX: 135,
      clientY: 95,
      elementByNodeId: new Map([
        ["lower", lowerNode],
        ["upper", upperNode],
      ]),
      nodes: [
        node("lower", 10, 20, 100, 60, 1),
        node("upper", 10, 20, 100, 60, 3),
      ],
      surfaceElement: surface,
      viewport: [0, 0, 1],
    });

    expect(target).toEqual({
      descriptor: {
        attribute: "data-gpu-flow-control",
        kind: "stable-attribute",
        tagName: "button",
        value: "upper-run",
      },
      nodeId: "upper",
    });
  });

  it("projects a stable source under the pointer before resolving a flat target", () => {
    const surface = document.createElement("div");
    const nodeElement = createNodeElement("node-a");
    const button = document.createElement("button");
    button.dataset.gpuFlowControl = "node-action";
    nodeElement.append(button);
    setRect(surface, 100, 50, 500, 400);
    setRect(button, 12, 0, 20, 12);
    const projections: unknown[] = [];

    const target = resolveGpuNodePointerHandoffTarget({
      clientX: 170,
      clientY: 110,
      elementByNodeId: new Map([["node-a", nodeElement]]),
      nodes: [node("node-a", 10, 20, 100, 60, 1)],
      projectSourceForHitTesting: (projection) => {
        projections.push(projection);
        expect(projection).toMatchObject({
          localX: 15,
          localY: 5,
          nodeId: "node-a",
          sourceElement: nodeElement,
          surfaceX: 70,
          surfaceY: 60,
        });
      },
      surfaceElement: surface,
      viewport: [20, 10, 2],
    });

    expect(target).toEqual({
      descriptor: {
        attribute: "data-gpu-flow-control",
        kind: "stable-attribute",
        tagName: "button",
        value: "node-action",
      },
      nodeId: "node-a",
    });
    expect(projections).toHaveLength(1);
  });

  it("uses the rendered visual scene to project mesh-backed node controls", () => {
    const surface = document.createElement("div");
    const nodeElement = createNodeElement("node-a");
    const button = document.createElement("button");
    button.dataset.gpuFlowControl = "mesh-action";
    nodeElement.append(button);
    setRect(surface, 0, 0, 600, 400);
    setRect(button, 45, 15, 20, 20);
    const projections: unknown[] = [];

    const target = resolveGpuNodePointerHandoffTarget({
      clientX: 250,
      clientY: 20,
      elementByNodeId: new Map([["node-a", nodeElement]]),
      nodes: [node("node-a", 0, 0, 100, 100, 1)],
      projectSourceForHitTesting: (projection) => {
        projections.push(projection);
      },
      surfaceElement: surface,
      viewport: [0, 0, 1],
      visualScene: createHtmlSurfaceVisualScene({
        meshSurfaces: [
          {
            bounds: { height: 100, width: 100, x: 200, y: 0 },
            indices: new Uint32Array([0, 1, 2, 1, 3, 2]),
            kind: "mesh",
            surfaceId: "node-a",
            texture: textureRecord("node-a", 100, 100),
            vertices: [
              { u: 0, v: 0, x: 200, y: 0 },
              { u: 1, v: 0, x: 300, y: 0 },
              { u: 0, v: 1, x: 200, y: 100 },
              { u: 1, v: 1, x: 300, y: 100 },
            ],
            zIndex: 1,
          },
        ],
      }),
    });

    expect(target).toEqual({
      descriptor: {
        attribute: "data-gpu-flow-control",
        kind: "stable-attribute",
        tagName: "button",
        value: "mesh-action",
      },
      nodeId: "node-a",
    });
    expect(projections).toHaveLength(1);
    expect(projections[0]).toMatchObject({
      nodeId: "node-a",
      sourceElement: nodeElement,
      surfaceX: 250,
      surfaceY: 20,
    });
    expect((projections[0] as { readonly localX: number }).localX).toBeCloseTo(
      50,
    );
    expect((projections[0] as { readonly localY: number }).localY).toBeCloseTo(
      20,
    );
  });

  it("does not project source DOM when a pointer hit has no interactive target", () => {
    const surface = document.createElement("div");
    const nodeElement = createNodeElement("node-a");
    const label = document.createElement("div");
    nodeElement.append(label);
    setRect(surface, 0, 0, 400, 200);
    setRect(label, 20, 20, 80, 32);
    const projections: unknown[] = [];

    expect(
      resolveGpuNodePointerHandoffTarget({
        clientX: 40,
        clientY: 40,
        elementByNodeId: new Map([["node-a", nodeElement]]),
        nodes: [node("node-a", 0, 0, 400, 200, 1)],
        projectSourceForHitTesting: (projection) => {
          projections.push(projection);
        },
        surfaceElement: surface,
        viewport: [0, 0, 1],
      }),
    ).toBeNull();
    expect(projections).toEqual([]);
  });

  it("describes controls by stable attributes or DOM path without visible text", () => {
    const nodeElement = createNodeElement("node-a");
    const stable = document.createElement("button");
    const structural = document.createElement("input");
    stable.dataset.testid = "node-action";
    stable.textContent = "Visible label is not a selector";
    structural.type = "range";
    nodeElement.append(stable, structural);

    expect(createGpuNodeTargetDescriptor(nodeElement, stable)).toEqual({
      attribute: "data-testid",
      kind: "stable-attribute",
      tagName: "button",
      value: "node-action",
    });
    const structuralDescriptor = createGpuNodeTargetDescriptor(
      nodeElement,
      structural,
    );

    expect(structuralDescriptor).toEqual({
      inputType: "range",
      kind: "dom-path",
      path: [1],
      role: null,
      tagName: "input",
    });
    expect(
      structuralDescriptor
        ? resolveGpuNodeTargetDescriptor(nodeElement, structuralDescriptor)
        : null,
    ).toBe(structural);
  });

  it("routes section resize handles through active node handoff", () => {
    const surface = document.createElement("div");
    const nodeElement = createNodeElement("node-a");
    const resizeHandle = document.createElement("div");
    resizeHandle.className =
      "section-resize-handle section-resize-handle-bottom-right";
    nodeElement.append(resizeHandle);
    setRect(surface, 0, 0, 400, 200);
    setRect(resizeHandle, 180, 120, 16, 16);

    expect(
      resolveGpuNodePointerHandoffTarget({
        clientX: 188,
        clientY: 128,
        elementByNodeId: new Map([["node-a", nodeElement]]),
        nodes: [node("node-a", 0, 0, 400, 200, 1)],
        surfaceElement: surface,
        viewport: [0, 0, 1],
      }),
    ).toEqual({
      descriptor: {
        inputType: null,
        kind: "dom-path",
        path: [0],
        role: null,
        tagName: "div",
      },
      nodeId: "node-a",
    });
  });

  it("resolves audited component-family active surfaces without visible text selectors", () => {
    const surface = document.createElement("div");
    const nodeElement = createNodeElement("node-a");
    const editor = document.createElement("article");
    const terminal = document.createElement("div");
    const spreadsheet = document.createElement("div");
    const iframe = document.createElement("iframe");
    editor.setAttribute("data-section-main-editor", "");
    terminal.dataset.gpuFlowControl = "terminal:node-a";
    spreadsheet.dataset.gpuFlowControl = "spreadsheet:node-a";
    iframe.title = "Rendered preview";
    nodeElement.append(editor, terminal, spreadsheet, iframe);
    setRect(surface, 0, 0, 600, 400);
    setRect(editor, 20, 20, 120, 60);
    setRect(terminal, 160, 20, 120, 60);
    setRect(spreadsheet, 300, 20, 120, 60);
    setRect(iframe, 440, 20, 120, 60);

    expect(
      resolveTargetValue({
        clientX: 40,
        elementByNodeId: new Map([["node-a", nodeElement]]),
        surface,
      }),
    ).toEqual({
      inputType: null,
      kind: "dom-path",
      path: [0],
      role: null,
      tagName: "article",
    });
    expect(
      resolveTargetValue({
        clientX: 180,
        elementByNodeId: new Map([["node-a", nodeElement]]),
        surface,
      }),
    ).toEqual({
      attribute: "data-gpu-flow-control",
      kind: "stable-attribute",
      tagName: "div",
      value: "terminal:node-a",
    });
    expect(
      resolveTargetValue({
        clientX: 320,
        elementByNodeId: new Map([["node-a", nodeElement]]),
        surface,
      }),
    ).toEqual({
      attribute: "data-gpu-flow-control",
      kind: "stable-attribute",
      tagName: "div",
      value: "spreadsheet:node-a",
    });
    expect(
      resolveTargetValue({
        clientX: 460,
        elementByNodeId: new Map([["node-a", nodeElement]]),
        surface,
      }),
    ).toEqual({
      inputType: null,
      kind: "dom-path",
      path: [3],
      role: null,
      tagName: "iframe",
    });
  });

  it("resolves browser image and media preview surfaces as active controls", () => {
    const surface = document.createElement("div");
    const nodeElement = createNodeElement("node-a");
    const image = document.createElement("img");
    const audio = document.createElement("audio");
    const video = document.createElement("video");
    image.dataset.gpuFlowControl = "browser-image-preview";
    audio.controls = true;
    video.controls = true;
    nodeElement.append(image, audio, video);
    setRect(surface, 0, 0, 400, 200);
    setRect(image, 20, 20, 80, 60);
    setRect(audio, 120, 20, 80, 60);
    setRect(video, 220, 20, 80, 60);

    expect(
      resolveTargetValue({
        clientX: 40,
        elementByNodeId: new Map([["node-a", nodeElement]]),
        surface,
      }),
    ).toEqual({
      attribute: "data-gpu-flow-control",
      kind: "stable-attribute",
      tagName: "img",
      value: "browser-image-preview",
    });
    expect(
      resolveTargetValue({
        clientX: 140,
        elementByNodeId: new Map([["node-a", nodeElement]]),
        surface,
      }),
    ).toEqual({
      inputType: null,
      kind: "dom-path",
      path: [1],
      role: null,
      tagName: "audio",
    });
    expect(
      resolveTargetValue({
        clientX: 240,
        elementByNodeId: new Map([["node-a", nodeElement]]),
        surface,
      }),
    ).toEqual({
      inputType: null,
      kind: "dom-path",
      path: [2],
      role: null,
      tagName: "video",
    });
  });

  it("resolves explicit param control surfaces that own first pointer interaction", () => {
    const surface = document.createElement("div");
    const nodeElement = createNodeElement("node-a");
    const sliderTrack = document.createElement("span");
    const dropzone = document.createElement("div");
    sliderTrack.dataset.gpuFlowInteractive = "true";
    sliderTrack.className = "nodrag nopan";
    dropzone.dataset.gpuFlowControl = "dropzone:node-a:param-a";
    dropzone.dataset.gpuFlowInteractive = "true";
    dropzone.className = "nodrag nopan";
    nodeElement.append(sliderTrack, dropzone);
    setRect(surface, 0, 0, 400, 200);
    setRect(sliderTrack, 20, 20, 120, 24);
    setRect(dropzone, 160, 20, 120, 60);

    expect(
      resolveTargetValue({
        clientX: 40,
        elementByNodeId: new Map([["node-a", nodeElement]]),
        surface,
      }),
    ).toEqual({
      inputType: null,
      kind: "dom-path",
      path: [0],
      role: null,
      tagName: "span",
    });
    expect(
      resolveTargetValue({
        clientX: 180,
        elementByNodeId: new Map([["node-a", nodeElement]]),
        surface,
      }),
    ).toEqual({
      attribute: "data-gpu-flow-control",
      kind: "stable-attribute",
      tagName: "div",
      value: "dropzone:node-a:param-a",
    });
  });

  it("ignores dnd-kit draggable wrappers while preserving nested controls", () => {
    const surface = document.createElement("div");
    const nodeElement = createNodeElement("node-a");
    const draggableWrapper = document.createElement("div");
    const title = document.createElement("p");
    const button = document.createElement("button");
    draggableWrapper.setAttribute("role", "button");
    draggableWrapper.setAttribute("aria-roledescription", "draggable");
    button.dataset.gpuFlowControl = "node-action";
    draggableWrapper.append(title, button);
    nodeElement.append(draggableWrapper);
    setRect(surface, 0, 0, 400, 200);
    setRect(draggableWrapper, 20, 20, 200, 120);
    setRect(title, 30, 30, 120, 20);
    setRect(button, 30, 70, 80, 24);

    expect(isGpuNodeInteractiveEventTarget(title)).toBe(false);
    expect(isGpuNodeInteractiveEventTarget(button)).toBe(true);
    expect(
      resolveGpuNodePointerHandoffTarget({
        clientX: 40,
        clientY: 40,
        elementByNodeId: new Map([["node-a", nodeElement]]),
        nodes: [node("node-a", 0, 0, 400, 200, 1)],
        surfaceElement: surface,
        viewport: [0, 0, 1],
      }),
    ).toBeNull();
    expect(
      resolveGpuNodePointerHandoffTarget({
        clientX: 40,
        clientY: 80,
        elementByNodeId: new Map([["node-a", nodeElement]]),
        nodes: [node("node-a", 0, 0, 400, 200, 1)],
        surfaceElement: surface,
        viewport: [0, 0, 1],
      })?.descriptor,
    ).toEqual({
      attribute: "data-gpu-flow-control",
      kind: "stable-attribute",
      tagName: "button",
      value: "node-action",
    });
  });

  it("treats editable descendants as active controls", () => {
    const surface = document.createElement("div");
    const nodeElement = createNodeElement("node-a");
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "plaintext-only");
    nodeElement.append(editor);
    setRect(surface, 0, 0, 400, 200);
    setRect(editor, 20, 20, 80, 40);

    expect(
      resolveTargetValue({
        clientX: 40,
        elementByNodeId: new Map([["node-a", nodeElement]]),
        surface,
      }),
    ).toEqual({
      inputType: null,
      kind: "dom-path",
      path: [0],
      role: null,
      tagName: "div",
    });
  });

  it("resolves explicit native wheel regions to their scrollable descendant", () => {
    const surface = document.createElement("div");
    const nodeElement = createNodeElement("node-a");
    const wheelRegion = document.createElement("div");
    const scroller = document.createElement("div");
    wheelRegion.className = "nowheel";
    scroller.style.overflowY = "auto";
    setScrollMetrics(scroller, {
      clientHeight: 120,
      clientWidth: 180,
      scrollHeight: 360,
      scrollWidth: 180,
    });
    wheelRegion.append(scroller);
    nodeElement.append(wheelRegion);
    setRect(surface, 0, 0, 400, 200);
    setRect(wheelRegion, 20, 20, 200, 140);
    setRect(scroller, 24, 24, 180, 120);

    expect(
      resolveGpuNodeWheelHandoffTarget({
        clientX: 40,
        clientY: 40,
        elementByNodeId: new Map([["node-a", nodeElement]]),
        nodes: [node("node-a", 0, 0, 400, 200, 1)],
        surfaceElement: surface,
        viewport: [0, 0, 1],
      })?.descriptor,
    ).toEqual({
      inputType: null,
      kind: "dom-path",
      path: [0, 0],
      role: null,
      tagName: "div",
    });
  });

  it("resolves scrollable overflow targets without a native wheel marker", () => {
    const surface = document.createElement("div");
    const nodeElement = createNodeElement("node-a");
    const scroller = document.createElement("div");
    scroller.style.overflowY = "auto";
    setScrollMetrics(scroller, {
      clientHeight: 120,
      clientWidth: 180,
      scrollHeight: 360,
      scrollWidth: 180,
    });
    nodeElement.append(scroller);
    setRect(surface, 0, 0, 400, 200);
    setRect(scroller, 24, 24, 180, 120);

    expect(
      resolveGpuNodeWheelHandoffTarget({
        clientX: 40,
        clientY: 40,
        elementByNodeId: new Map([["node-a", nodeElement]]),
        nodes: [node("node-a", 0, 0, 400, 200, 1)],
        surfaceElement: surface,
        viewport: [0, 0, 1],
      })?.descriptor,
    ).toEqual({
      inputType: null,
      kind: "dom-path",
      path: [0],
      role: null,
      tagName: "div",
    });
  });

  it("falls back to the nearest scrollable wheel region inside the node", () => {
    const surface = document.createElement("div");
    const nodeElement = createNodeElement("node-a");
    const wheelRegion = document.createElement("div");
    const scroller = document.createElement("div");
    wheelRegion.className = "nowheel";
    scroller.style.overflowY = "auto";
    setScrollMetrics(scroller, {
      clientHeight: 120,
      clientWidth: 180,
      scrollHeight: 360,
      scrollWidth: 180,
    });
    wheelRegion.append(scroller);
    nodeElement.append(wheelRegion);
    setRect(surface, 0, 0, 400, 200);
    setRect(wheelRegion, 20, 20, 200, 140);
    setRect(scroller, 24, 24, 180, 120);

    expect(
      resolveGpuNodeWheelHandoffTarget({
        clientX: 40,
        clientY: 18,
        elementByNodeId: new Map([["node-a", nodeElement]]),
        nodes: [node("node-a", 0, 0, 400, 200, 1)],
        surfaceElement: surface,
        viewport: [0, 0, 1],
      })?.descriptor,
    ).toEqual({
      inputType: null,
      kind: "dom-path",
      path: [0, 0],
      role: null,
      tagName: "div",
    });
  });

  it("does not fall back to non-scrollable wheel regions", () => {
    const surface = document.createElement("div");
    const nodeElement = createNodeElement("node-a");
    const button = document.createElement("button");
    button.className = "nowheel";
    nodeElement.append(button);
    setRect(surface, 0, 0, 400, 200);
    setRect(button, 20, 20, 80, 32);

    expect(
      resolveGpuNodeWheelHandoffTarget({
        clientX: 40,
        clientY: 18,
        elementByNodeId: new Map([["node-a", nodeElement]]),
        nodes: [node("node-a", 0, 0, 400, 200, 1)],
        surfaceElement: surface,
        viewport: [0, 0, 1],
      }),
    ).toBeNull();
  });

  it("does not project source DOM when a wheel hit has no wheel target", () => {
    const surface = document.createElement("div");
    const nodeElement = createNodeElement("node-a");
    const label = document.createElement("div");
    nodeElement.append(label);
    setRect(surface, 0, 0, 400, 200);
    setRect(label, 20, 20, 80, 32);
    const projections: unknown[] = [];

    expect(
      resolveGpuNodeWheelHandoffTarget({
        clientX: 40,
        clientY: 40,
        elementByNodeId: new Map([["node-a", nodeElement]]),
        nodes: [node("node-a", 0, 0, 400, 200, 1)],
        projectSourceForHitTesting: (projection) => {
          projections.push(projection);
        },
        surfaceElement: surface,
        viewport: [0, 0, 1],
      }),
    ).toBeNull();
    expect(projections).toEqual([]);
  });

  it("reuses active target candidates until source DOM changes", () => {
    const surface = document.createElement("div");
    const nodeElement = createNodeElement("node-a");
    for (let index = 0; index < 20; index += 1) {
      const input = document.createElement("input");
      input.type = index % 2 === 0 ? "range" : "text";
      nodeElement.append(input);
    }
    const button = document.createElement("button");
    button.dataset.gpuFlowControl = "cached-target";
    nodeElement.append(button);
    setRect(surface, 0, 0, 400, 200);
    setRect(nodeElement, 0, 0, 400, 200);
    setRect(button, 20, 20, 80, 32);
    const calls: string[] = [];
    recordQuerySelectorAll(nodeElement, calls);
    const resolveTarget = () =>
      resolveGpuNodePointerHandoffTarget({
        clientX: 40,
        clientY: 40,
        elementByNodeId: new Map([["node-a", nodeElement]]),
        nodes: [node("node-a", 0, 0, 400, 200, 1)],
        surfaceElement: surface,
        viewport: [0, 0, 1],
      })?.descriptor;

    expect(resolveTarget()).toEqual({
      attribute: "data-gpu-flow-control",
      kind: "stable-attribute",
      tagName: "button",
      value: "cached-target",
    });
    expect(calls).toHaveLength(1);
    expect(resolveTarget()).toEqual({
      attribute: "data-gpu-flow-control",
      kind: "stable-attribute",
      tagName: "button",
      value: "cached-target",
    });
    expect(calls).toHaveLength(1);

    const smallerButton = document.createElement("button");
    smallerButton.dataset.gpuFlowControl = "mutated-target";
    setRect(smallerButton, 30, 30, 20, 12);
    nodeElement.append(smallerButton);

    expect(resolveTarget()).toEqual({
      attribute: "data-gpu-flow-control",
      kind: "stable-attribute",
      tagName: "button",
      value: "mutated-target",
    });
    expect(calls).toHaveLength(2);

    clearGpuNodeTargetingCache(nodeElement);
    expect(resolveTarget()).toEqual({
      attribute: "data-gpu-flow-control",
      kind: "stable-attribute",
      tagName: "button",
      value: "mutated-target",
    });
    expect(calls).toHaveLength(3);
    clearGpuNodeTargetingCache(nodeElement);
  });

  it("reuses wheel target candidates and last scroll target", () => {
    const surface = document.createElement("div");
    const nodeElement = createNodeElement("node-a");
    const wheelRegion = document.createElement("div");
    const scroller = document.createElement("div");
    wheelRegion.className = "nowheel";
    scroller.style.overflowY = "auto";
    setScrollMetrics(scroller, {
      clientHeight: 120,
      clientWidth: 180,
      scrollHeight: 360,
      scrollWidth: 180,
    });
    for (let index = 0; index < 20; index += 1) {
      scroller.append(document.createElement("div"));
    }
    wheelRegion.append(scroller);
    nodeElement.append(wheelRegion);
    setRect(surface, 0, 0, 400, 200);
    setRect(nodeElement, 0, 0, 400, 200);
    setRect(wheelRegion, 20, 20, 200, 140);
    setRect(scroller, 24, 24, 180, 120);
    const calls: string[] = [];
    recordQuerySelectorAll(nodeElement, calls);
    recordQuerySelectorAll(wheelRegion, calls);
    const resolveTarget = () =>
      resolveGpuNodeWheelHandoffTarget({
        clientX: 40,
        clientY: 40,
        elementByNodeId: new Map([["node-a", nodeElement]]),
        nodes: [node("node-a", 0, 0, 400, 200, 1)],
        surfaceElement: surface,
        viewport: [0, 0, 1],
      })?.descriptor;

    expect(resolveTarget()).toEqual({
      inputType: null,
      kind: "dom-path",
      path: [0, 0],
      role: null,
      tagName: "div",
    });
    expect(calls).toHaveLength(2);
    expect(resolveTarget()).toEqual({
      inputType: null,
      kind: "dom-path",
      path: [0, 0],
      role: null,
      tagName: "div",
    });
    expect(calls).toHaveLength(2);

    clearGpuNodeTargetingCache(nodeElement);
    clearGpuNodeTargetingCache(wheelRegion);
  });
});

function createNodeElement(nodeId: string): HTMLElement {
  const element = document.createElement("div");
  element.dataset.gpuFlowNode = "true";
  element.dataset.id = nodeId;
  return element;
}

function node(
  nodeId: string,
  x: number,
  y: number,
  width: number,
  height: number,
  zIndex: number,
): GpuNodeLayout {
  return {
    height,
    nodeId,
    width,
    x,
    y,
    zIndex,
  };
}

function setRect(
  element: Element,
  left: number,
  top: number,
  width: number,
  height: number,
) {
  element.getBoundingClientRect = () =>
    ({
      bottom: top + height,
      height,
      left,
      right: left + width,
      top,
      width,
      x: left,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;
}

function setScrollMetrics(
  element: HTMLElement,
  metrics: {
    readonly clientHeight: number;
    readonly clientWidth: number;
    readonly scrollHeight: number;
    readonly scrollWidth: number;
  },
) {
  Object.defineProperties(element, {
    clientHeight: { configurable: true, value: metrics.clientHeight },
    clientWidth: { configurable: true, value: metrics.clientWidth },
    scrollHeight: { configurable: true, value: metrics.scrollHeight },
    scrollWidth: { configurable: true, value: metrics.scrollWidth },
  });
}

function recordQuerySelectorAll(element: HTMLElement, calls: string[]) {
  const querySelectorAll = element.querySelectorAll.bind(element);
  element.querySelectorAll = ((selector: string) => {
    calls.push(selector);
    return querySelectorAll(selector);
  }) as typeof element.querySelectorAll;
}

function textureRecord(
  surfaceId: string,
  cssWidth: number,
  cssHeight: number,
): HtmlSurfaceTextureRecord {
  return {
    clampedByMaxTexture: false,
    cssHeight,
    cssWidth,
    dirtyContent: false,
    dirtyResolution: false,
    lastUploadFrame: 1,
    lastVisibleFrame: 1,
    maxTextureDimension2D: 4096,
    pixelHeight: cssHeight,
    pixelWidth: cssWidth,
    priority: "visible",
    requestedScale: 1,
    resolutionScale: 1,
    sampler: {} as GPUSampler,
    surfaceId,
    texture: {} as GPUTexture,
    textureBytes: cssWidth * cssHeight * 4,
    textureLayout: { kind: "single", tileCount: 1 },
    textureView: {} as GPUTextureView,
    tiles: [],
    zoomBucket: 1,
  };
}

function resolveTargetValue({
  clientX,
  elementByNodeId,
  surface,
}: {
  readonly clientX: number;
  readonly elementByNodeId: ReadonlyMap<string, HTMLElement>;
  readonly surface: HTMLElement;
}) {
  return resolveGpuNodePointerHandoffTarget({
    clientX,
    clientY: 40,
    elementByNodeId,
    nodes: [node("node-a", 0, 0, 600, 200, 1)],
    surfaceElement: surface,
    viewport: [0, 0, 1],
  })?.descriptor;
}
