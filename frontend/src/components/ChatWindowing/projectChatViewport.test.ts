import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { createProjectConfig } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PROJECT_CHAT_WORKSPACE_SELECTOR,
  resolveProjectChatFloatingViewport,
} from "./projectChatViewport";

describe("resolveProjectChatFloatingViewport", () => {
  beforeEach(() => {
    resetProjectStores();
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-id",
        name: "demo",
        viewModes: {
          "view-mode-1": {
            id: "view-mode-1",
            name: "Bottom Tabs",
            isTab: true,
          },
        },
      }),
    });
    vi.stubGlobal("window", {
      innerWidth: 1720,
      innerHeight: 980,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses the floating window rails instead of pane side gutters", () => {
    // The pane can be inset by surrounding editor chrome, but snapped chat
    // windows still anchor to the dedicated floating rails.
    class FakeHTMLElement {
      getBoundingClientRect(): DOMRect {
        return {
          x: 280,
          y: 52,
          width: 1160,
          height: 780,
          top: 52,
          right: 1440,
          bottom: 832,
          left: 280,
          toJSON: () => ({}),
        } as DOMRect;
      }
    }
    vi.stubGlobal("HTMLElement", FakeHTMLElement as typeof HTMLElement);
    const pane = new FakeHTMLElement();
    const querySelector = vi.fn(() => pane);
    vi.stubGlobal("document", {
      querySelector,
    });
    vi.spyOn(pane, "getBoundingClientRect").mockReturnValue({
      x: 280,
      y: 52,
      width: 1160,
      height: 780,
      top: 52,
      right: 1440,
      bottom: 832,
      left: 280,
      toJSON: () => ({}),
    } as DOMRect);

    expect(resolveProjectChatFloatingViewport()).toEqual({
      viewportWidthPx: 1720,
      viewportHeightPx: 980,
      insets: {
        left: 40,
        right: 40,
        top: 52,
        bottom: 36,
      },
    });
    expect(querySelector).toHaveBeenCalledWith(PROJECT_CHAT_WORKSPACE_SELECTOR);
  });
});
