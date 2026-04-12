/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import * as edgeActions from "state/actions/edges";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReactFlow } from "../../store";
import initialState from "../../store/initialState";
import { HandlePosition, type WrapEdgeProps } from "../../types";
import * as handleHandler from "../Handle/handler";
import wrapEdge from "./wrapEdge";

type RenderedEdge = {
  host: HTMLDivElement;
  root: Root;
};

const BaseEdge = vi.fn(({ id }: WrapEdgeProps) => (
  <path data-testid="base-edge" data-edge-id={id} />
));

const WrappedEdge = wrapEdge(BaseEdge);

const baseProps: WrapEdgeProps = {
  id: "edge-a",
  source: "section-a",
  target: "section-b",
  sourceHandleId: "source-port",
  targetHandleId: "target-port",
  sourceX: 10,
  sourceY: 20,
  targetX: 110,
  targetY: 120,
  sourcePosition: HandlePosition.Right,
  targetPosition: HandlePosition.Left,
};

async function dispatchSvgMouseEvent(
  target: Element,
  type: "click" | "mousedown",
  init: MouseEventInit = {},
) {
  await act(async () => {
    target.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        ...init,
      }),
    );
  });
}

async function renderWrappedEdge(
  props: Partial<WrapEdgeProps> = {},
): Promise<RenderedEdge> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(
      <svg>
        <WrappedEdge {...baseProps} {...props} />
      </svg>,
    );
  });

  return { host, root };
}

async function disposeRenderedEdge({ host, root }: RenderedEdge) {
  await act(async () => {
    root.unmount();
  });
  host.remove();
}

describe("wrapEdge", () => {
  beforeEach(() => {
    BaseEdge.mockClear();
    useReactFlow.setState({ ...initialState, multiSelectionActive: true });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    useReactFlow.setState({ ...initialState });
    document.body.innerHTML = "";
  });

  it("toggles edge selection using the current multi-select state", async () => {
    const toggleEdgeSelectionSpy = vi
      .spyOn(edgeActions, "toggleEdgeSelection")
      .mockImplementation(() => {});
    const rendered = await renderWrappedEdge();

    try {
      const edge = rendered.host.querySelector(".react-flow__edge");
      expect(edge).not.toBeNull();

      await dispatchSvgMouseEvent(edge!, "click");

      expect(toggleEdgeSelectionSpy).toHaveBeenCalledOnce();
      expect(toggleEdgeSelectionSpy).toHaveBeenCalledWith("edge-a", true);
    } finally {
      await disposeRenderedEdge(rendered);
    }
  });

  it("ignores clicks when the edge is not selectable", async () => {
    const toggleEdgeSelectionSpy = vi
      .spyOn(edgeActions, "toggleEdgeSelection")
      .mockImplementation(() => {});
    const rendered = await renderWrappedEdge({ elementsSelectable: false });

    try {
      const edge = rendered.host.querySelector(".react-flow__edge");
      expect(edge?.classList.contains("inactive")).toBe(true);

      await dispatchSvgMouseEvent(edge!, "click");

      expect(toggleEdgeSelectionSpy).not.toHaveBeenCalled();
    } finally {
      await disposeRenderedEdge(rendered);
    }
  });

  it("routes source and target reconnect anchors through handlePointerDown", async () => {
    const handlePointerDownSpy = vi
      .spyOn(handleHandler, "handlePointerDown")
      .mockImplementation(() => {});
    const onReconnect = vi.fn();
    const rendered = await renderWrappedEdge({ onReconnect });

    try {
      const sourceAnchor = rendered.host.querySelector(
        ".react-flow__edgeupdater-source",
      );
      const targetAnchor = rendered.host.querySelector(
        ".react-flow__edgeupdater-target",
      );

      expect(sourceAnchor).not.toBeNull();
      expect(targetAnchor).not.toBeNull();

      await dispatchSvgMouseEvent(sourceAnchor!, "mousedown", { button: 0 });
      await dispatchSvgMouseEvent(targetAnchor!, "mousedown", { button: 0 });

      expect(handlePointerDownSpy).toHaveBeenCalledTimes(2);
      expect(handlePointerDownSpy).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          handleId: "target-port",
          nodeId: "section-b",
          isTarget: true,
          edgeUpdaterType: "target",
          onConnect: onReconnect,
        }),
      );
      expect(handlePointerDownSpy).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          handleId: "source-port",
          nodeId: "section-a",
          isTarget: false,
          edgeUpdaterType: "source",
          onConnect: onReconnect,
        }),
      );
    } finally {
      await disposeRenderedEdge(rendered);
    }
  });

  it("does not render hidden edges", async () => {
    const rendered = await renderWrappedEdge({ hidden: true });

    try {
      expect(rendered.host.querySelector(".react-flow__edge")).toBeNull();
      expect(BaseEdge).not.toHaveBeenCalled();
    } finally {
      await disposeRenderedEdge(rendered);
    }
  });
});
