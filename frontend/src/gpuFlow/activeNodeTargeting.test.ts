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
