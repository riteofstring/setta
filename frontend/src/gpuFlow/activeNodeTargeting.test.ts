/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import type { GpuNodeLayout } from "./GpuNodeLayer";
import {
  createGpuNodeTargetDescriptor,
  resolveGpuNodePointerHandoffTarget,
  resolveGpuNodeTargetDescriptor,
} from "./activeNodeTargeting";

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
    setRect(lowerButton, 130, 90, 40, 20);
    setRect(upperButton, 130, 90, 40, 20);

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
