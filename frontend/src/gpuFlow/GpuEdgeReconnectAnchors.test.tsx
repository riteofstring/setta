/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import "testUtils/reactRefreshPreamble";
import { NO_DRAG_CLASS_NAME, NO_PAN_CLASS_NAME } from "utils/constants";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Connection } from "./flowTypes";

const handlePointerDownMock = vi.hoisted(() => vi.fn());

vi.mock("./Handle/handler", () => ({
  handlePointerDown: handlePointerDownMock,
}));

import {
  getGpuEdgeReconnectAnchorLayerStyle,
  getGpuEdgeReconnectAnchorStyle,
  GpuEdgeReconnectAnchorLayer,
} from "./GpuEdgeReconnectAnchors";
import type { GpuEdgeReconnectAnchor } from "./edges/edgeSources";

describe("GpuEdgeReconnectAnchorLayer", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  beforeEach(() => {
    handlePointerDownMock.mockReset();
    container = document.createElement("div");
    document.body.append(container);
  });

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
      root = null;
    }
    container?.remove();
    container = null;
  });

  it("aligns reconnect anchors through the GPU viewport transform", () => {
    expect(getGpuEdgeReconnectAnchorLayerStyle([10, -20, 2])).toEqual({
      transform: "translate(10px, -20px) scale(2)",
    });
    expect(getGpuEdgeReconnectAnchorStyle(sourceAnchor())).toEqual({
      height: 24,
      transform: "translate(100px, 38px)",
      width: 24,
      zIndex: 4,
    });
  });

  it("renders nodrag and nopan edge updater anchors", () => {
    const markup = renderToStaticMarkup(
      <GpuEdgeReconnectAnchorLayer
        anchors={[sourceAnchor()]}
        options={{ onReconnect: vi.fn() }}
        viewport={[10, -20, 2]}
      />,
    );

    expect(markup).toContain('data-gpu-flow-edge-reconnect-layer="true"');
    expect(markup).toContain(
      'data-testid="gpu-edge-reconnect-anchor-data-edge-reconnect:edge-a:source"',
    );
    expect(markup).toContain('data-edgeid="edge-a"');
    expect(markup).toContain('data-edge-endpoint="source"');
    expect(markup).toContain("react-flow__edgeupdater-source");
    expect(markup).toContain(NO_DRAG_CLASS_NAME);
    expect(markup).toContain(NO_PAN_CLASS_NAME);
    expect(markup).toContain("translate(10px, -20px) scale(2)");
    expect(markup).toContain("translate(100px, 38px)");
  });

  it("starts data edge reconnects from the fixed opposite endpoint", () => {
    const onReconnect = vi.fn();
    const isValidConnection = vi.fn(() => true);
    root = createRoot(container!);
    act(() => {
      root?.render(
        <GpuEdgeReconnectAnchorLayer
          anchors={[sourceAnchor()]}
          options={{ isValidConnection, onReconnect }}
          viewport={[0, 0, 1]}
        />,
      );
    });

    const anchorElement = container!.querySelector<HTMLElement>(
      '[data-gpu-flow-edge-reconnect-anchor="true"]',
    );
    expect(anchorElement).not.toBeNull();
    act(() => {
      anchorElement?.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          button: 0,
          cancelable: true,
          clientX: 112,
          clientY: 50,
        }),
      );
    });

    expect(handlePointerDownMock).toHaveBeenCalledTimes(1);
    const call = handlePointerDownMock.mock.calls[0]?.[0];
    expect(call).toMatchObject({
      edgeUpdaterType: "target",
      handleId: "in",
      isTarget: true,
      nodeId: "target",
    });
    expect(call.isValidConnection).toBe(isValidConnection);

    const connection: Connection = {
      source: "new-source",
      sourceHandle: "new-out",
      target: "target",
      targetHandle: "in",
    };
    call.onConnect(connection);

    expect(onReconnect).toHaveBeenCalledWith("edge-a", connection);
  });
});

function sourceAnchor(): GpuEdgeReconnectAnchor {
  return {
    edgeId: "edge-a",
    endpoint: "source",
    fixedHandleId: "in",
    fixedHandleType: "target",
    fixedIsTarget: true,
    fixedSectionId: "target",
    id: "data-edge-reconnect:edge-a:source",
    radius: 12,
    x: 112,
    y: 50,
    zIndex: 4,
  };
}
