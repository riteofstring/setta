/* @vitest-environment jsdom */

import { act, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { gpuFlowViewportStore } from "gpuFlow/viewportStore";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResizableWithScale } from "./ResizableWithScale";

type MockResizableProps = {
  children?: ReactNode;
  onResizeStart?: (
    event: ReactMouseEvent<HTMLDivElement>,
    direction: string,
    ref: HTMLDivElement,
  ) => void;
  scale?: number;
};

const mockResizableProps = vi.hoisted(() => [] as MockResizableProps[]);

vi.mock("re-resizable", async () => {
  const React = await import("react");
  return {
    Resizable: (props: MockResizableProps) => {
      mockResizableProps.push(props);
      return React.createElement(
        "div",
        {
          "data-testid": "resizable",
          onMouseDown: (event: ReactMouseEvent<HTMLDivElement>) => {
            props.onResizeStart?.(event, "right", event.currentTarget);
          },
        },
        props.children,
      );
    },
  };
});

describe("ResizableWithScale", () => {
  afterEach(() => {
    mockResizableProps.length = 0;
    gpuFlowViewportStore.setState({ transform: [0, 0, 1] });
  });

  it("snapshots the current GPU zoom when resize starts", () => {
    const rootHost = document.createElement("div");
    document.body.append(rootHost);
    const root = createRoot(rootHost);
    const onResizeStart = vi.fn();

    try {
      act(() => {
        gpuFlowViewportStore.setState({ transform: [12, 24, 1.75] });
        root.render(
          <ResizableWithScale onResizeStart={onResizeStart}>
            <span>content</span>
          </ResizableWithScale>,
        );
      });

      expect(latestScale()).toBe(1);

      dispatchResizeStart(rootHost);

      expect(onResizeStart).toHaveBeenCalledTimes(1);
      expect(latestScale()).toBe(1.75);

      act(() => {
        gpuFlowViewportStore.setState({ transform: [12, 24, 0.5] });
      });
      dispatchResizeStart(rootHost);

      expect(onResizeStart).toHaveBeenCalledTimes(2);
      expect(latestScale()).toBe(0.5);
    } finally {
      cleanupRoot(root, rootHost);
    }
  });
});

function dispatchResizeStart(rootHost: HTMLElement) {
  const target = rootHost.querySelector<HTMLElement>('[data-testid="resizable"]');
  if (!target) {
    throw new Error("Expected mocked resizable root to be rendered.");
  }
  act(() => {
    target.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
    );
  });
}

function latestScale() {
  return mockResizableProps.at(-1)?.scale;
}

function cleanupRoot(root: Root, rootHost: HTMLElement) {
  act(() => {
    root.unmount();
  });
  rootHost.remove();
}
