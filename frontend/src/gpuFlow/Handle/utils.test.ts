// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectionMode } from "../flowTypes";
import {
  getClosestHandle,
  isValidHandle,
  type ConnectionHandle,
} from "./utils";

function createConnectionResult(
  isValid: boolean,
  handleDomNode: Element | null = null,
) {
  return {
    handleDomNode,
    isValid,
    connection: {
      source: null,
      sourceHandle: null,
      target: null,
      targetHandle: null,
    },
    endHandle: null,
  };
}

function appendHandleElement({
  sectionId,
  handleId,
  type,
  extraClasses = [],
}: {
  sectionId: string;
  handleId: string | null;
  type: "source" | "target";
  extraClasses?: string[];
}) {
  const element = document.createElement("div");
  element.className = ["react-flow__handle", type, ...extraClasses].join(" ");
  element.setAttribute("data-id", `${sectionId}-${handleId}-${type}`);
  element.setAttribute("data-nodeid", sectionId);

  if (handleId !== null) {
    element.setAttribute("data-handleid", handleId);
  }

  document.body.appendChild(element);

  return element;
}

function mockElementsFromPoint(elements: Element[]) {
  Object.defineProperty(document, "elementsFromPoint", {
    configurable: true,
    value: vi.fn(() => elements),
  });
}

describe("isValidHandle", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    mockElementsFromPoint([]);
  });

  it("builds a strict target-to-source connection and delegates final validation", () => {
    const handleElement = appendHandleElement({
      sectionId: "section-b",
      handleId: "output-port",
      type: "source",
      extraClasses: ["connectable", "connectableend"],
    });
    const isValidConnection = vi.fn(() => true);

    const result = isValidHandle({
      handle: {
        sectionId: "section-b",
        portId: "output-port",
        type: "source",
      },
      connectionMode: ConnectionMode.Strict,
      from: {
        sectionId: "section-a",
        handleId: "input-port",
        type: "target",
      },
      isValidConnection,
      doc: document,
    });

    expect(result.handleDomNode).toBe(handleElement);
    expect(result.connection).toEqual({
      source: "section-b",
      sourceHandle: "output-port",
      target: "section-a",
      targetHandle: "input-port",
    });
    expect(result.endHandle).toEqual({
      sectionId: "section-b",
      handleId: "output-port",
      type: "source",
    });
    expect(result.isValid).toBe(true);
    expect(isValidConnection).toHaveBeenCalledWith(result.connection);
  });
});

describe("getClosestHandle", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    mockElementsFromPoint([]);
  });

  it("prefers the pointer-hit handle and reuses stored handle coordinates", () => {
    const handleElement = appendHandleElement({
      sectionId: "section-b",
      handleId: "target-port",
      type: "target",
    });
    mockElementsFromPoint([handleElement]);

    const handles: ConnectionHandle[] = [
      {
        sectionId: "section-b",
        portId: "target-port",
        type: "target",
        x: 120,
        y: 40,
      },
    ];
    const validator = vi.fn(() => createConnectionResult(false, handleElement));

    const result = getClosestHandle({
      event: new MouseEvent("mousemove", { clientX: 10, clientY: 20 }),
      doc: document,
      pos: { x: 5, y: 6 },
      connectionRadius: 30,
      handles,
      allowHandle: null,
      validator,
    });

    expect(result.handle).toEqual(handles[0]);
    expect(result.validHandleResult.handleDomNode).toBe(handleElement);
    expect(validator).toHaveBeenCalledWith({
      sectionId: "section-b",
      portId: "target-port",
      type: "target",
    });
  });

  it("prefers a valid target handle when multiple closest handles tie", () => {
    const handles: ConnectionHandle[] = [
      {
        sectionId: "section-source",
        portId: "source-port",
        type: "source",
        x: 40,
        y: 40,
      },
      {
        sectionId: "section-target",
        portId: "target-port",
        type: "target",
        x: 40,
        y: 40,
      },
    ];
    const validator = vi.fn((handle: Pick<ConnectionHandle, "type">) =>
      createConnectionResult(handle.type === "target"),
    );

    const result = getClosestHandle({
      event: new MouseEvent("mousemove", { clientX: 0, clientY: 0 }),
      doc: document,
      pos: { x: 40, y: 40 },
      connectionRadius: 1,
      handles,
      allowHandle: null,
      validator,
    });

    expect(result.handle).toEqual(handles[1]);
    expect(result.validHandleResult.isValid).toBe(true);
  });
});
