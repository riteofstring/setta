/* @vitest-environment jsdom */

import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CANVAS_FLOW_VIEWPORT_CHANGE_EVENT } from "utils/constants";
import { StandardPopover } from "./standardpopover";

let pendingAnimationFrames: FrameRequestCallback[] = [];

vi.mock("@radix-ui/react-popover", async () => {
  const React = await import("react");
  const passthrough = (Tag: React.ElementType) => {
    return ({
      children,
      ...props
    }: {
      children?: React.ReactNode;
    } & Record<string, unknown>) => React.createElement(Tag, props, children);
  };
  const Fragment = ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);
  const Content = ({
    children,
    updatePositionStrategy,
    ...props
  }: {
    children?: React.ReactNode;
    updatePositionStrategy?: string;
  } & Record<string, unknown>) =>
    React.createElement(
      "div",
      {
        ...props,
        "data-update-position-strategy": updatePositionStrategy,
      },
      children,
    );

  return {
    Root: Fragment,
    Trigger: Fragment,
    Portal: Fragment,
    Content,
    Close: passthrough("button"),
    Arrow: passthrough("span"),
  };
});

type RenderedPopover = {
  host: HTMLDivElement;
  root: Root;
};

async function renderPopover(
  props: Partial<ComponentProps<typeof StandardPopover>> = {},
): Promise<RenderedPopover> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(
      <StandardPopover open={true} trigger={<button>Open</button>} {...props}>
        <div>Content</div>
      </StandardPopover>,
    );
  });

  return { host, root };
}

async function unmountRenderedPopover(root: Root) {
  await act(async () => {
    root.unmount();
  });
}

describe("StandardPopover", () => {
  beforeEach(() => {
    let frameId = 0;
    pendingAnimationFrames = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(
      (callback) => {
        frameId += 1;
        pendingAnimationFrames.push(callback);
        return frameId;
      },
    );
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("repositions open popovers on CanvasFlow viewport changes by default", async () => {
    const events: string[] = [];
    const recordScroll = () => events.push("scroll");
    const recordResize = () => events.push("resize");
    window.addEventListener("scroll", recordScroll);
    window.addEventListener("resize", recordResize);

    const { root } = await renderPopover();
    try {
      expect(
        document
          .querySelector("[data-update-position-strategy]")
          ?.getAttribute("data-update-position-strategy"),
      ).toBe("always");
      flushAnimationFrames();
      expect(events).toEqual(["scroll", "resize"]);

      act(() => {
        window.dispatchEvent(new Event(CANVAS_FLOW_VIEWPORT_CHANGE_EVENT));
      });
      flushAnimationFrames();

      expect(events).toEqual(["scroll", "resize", "scroll", "resize"]);
    } finally {
      window.removeEventListener("scroll", recordScroll);
      window.removeEventListener("resize", recordResize);
      await unmountRenderedPopover(root);
    }
  });

  it("can opt out of CanvasFlow viewport repositioning", async () => {
    const events: string[] = [];
    const recordScroll = () => events.push("scroll");
    const recordResize = () => events.push("resize");
    window.addEventListener("scroll", recordScroll);
    window.addEventListener("resize", recordResize);

    const { root } = await renderPopover({
      repositionOnCanvasTransform: false,
    });
    try {
      flushAnimationFrames();
      act(() => {
        window.dispatchEvent(new Event(CANVAS_FLOW_VIEWPORT_CHANGE_EVENT));
      });
      flushAnimationFrames();

      expect(events).toEqual([]);
    } finally {
      window.removeEventListener("scroll", recordScroll);
      window.removeEventListener("resize", recordResize);
      await unmountRenderedPopover(root);
    }
  });
});

function flushAnimationFrames() {
  const callbacks = pendingAnimationFrames;
  pendingAnimationFrames = [];
  for (const callback of callbacks) {
    callback(performance.now());
  }
}
