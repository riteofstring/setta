// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  getCustomResizableChromeConfig,
  getResizeHandleDirectionFromTarget,
} from "./customResizableChrome";

describe("getResizeHandleDirectionFromTarget", () => {
  it("detects the resize direction from nested handle content", () => {
    const handle = document.createElement("div");
    handle.className =
      "section-resize-handle section-resize-handle-bottom-right";
    const icon = document.createElement("span");
    handle.append(icon);

    expect(getResizeHandleDirectionFromTarget(icon)).toBe("bottomRight");
  });
});

describe("getCustomResizableChromeConfig", () => {
  it("widens attached terminal handle hit areas and wrapper z-index", () => {
    const config = getCustomResizableChromeConfig({
      disablePointerEvents: false,
      allowPointerEvents: false,
      positionAndSizeLocked: false,
      heightResizable: true,
      widthResizable: true,
      isMetaControl: false,
      isAttachedTerminalChild: true,
      activeResizeHandle: null,
    });

    expect(config.handleWrapperClassName).toContain("[&>div]:z-30");
    expect(config.handleStyles.bottomRight).toMatchObject({
      width: 24,
      height: 24,
    });
  });

  it("marks the active meta control handle and keeps only enabled directions", () => {
    const config = getCustomResizableChromeConfig({
      disablePointerEvents: false,
      allowPointerEvents: false,
      positionAndSizeLocked: false,
      heightResizable: false,
      widthResizable: true,
      isMetaControl: true,
      isAttachedTerminalChild: false,
      activeResizeHandle: "right",
    });

    expect(config.enable).toEqual({
      top: false,
      left: false,
      bottom: false,
      right: true,
      topRight: false,
      bottomRight: false,
      topLeft: false,
      bottomLeft: false,
    });
    expect(config.handleClasses.right).toContain("opacity-100");
    expect(config.handleClasses.right).toContain("cursor-col-resize");
  });
});
