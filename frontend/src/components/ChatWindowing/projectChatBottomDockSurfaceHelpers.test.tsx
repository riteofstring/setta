import { ChatWindowModeEnum } from "utils/generatedTypes";
import { describe, expect, it, vi } from "vitest";
import {
  buildDockedWindowActionSpecs,
  buildFloatingWindowActionSpecs,
  buildMaximizedWindowActionSpecs,
} from "./projectChatBottomDockSurfaceHelpers";

describe("buildDockedWindowActionSpecs", () => {
  it("includes cycle controls and canvas actions for regular docked chats", () => {
    const onCycleDockWindowsBackward = vi.fn();
    const onCycleDockWindowsForward = vi.fn();
    const onShowInCanvas = vi.fn();
    const onUndockWindow = vi.fn();
    const onMaximizeWindow = vi.fn();
    const onMinimizeWindow = vi.fn();
    const onCloseWindow = vi.fn();

    const actionSpecs = buildDockedWindowActionSpecs({
      window: {
        instanceId: "dock-1",
        title: "Chat Window 1",
        mode: ChatWindowModeEnum.project_ai_mode,
      },
      showDockHeaderCycleControls: true,
      canCycleDockBackward: false,
      canCycleDockForward: true,
      onCycleDockWindowsBackward,
      onCycleDockWindowsForward,
      onShowInCanvas,
      onUndockWindow,
      onMaximizeWindow,
      onMinimizeWindow,
      onCloseWindow,
    });

    // Docked windows should keep the same visible header action order after the extraction.
    expect(actionSpecs.map((action) => action.key)).toEqual([
      "cycle_left",
      "cycle_right",
      "show_in_canvas",
      "undock",
      "maximize",
      "minimize",
      "close",
    ]);
    expect(actionSpecs[0]?.disabled).toBe(true);
    expect(actionSpecs[1]?.disabled).toBe(false);

    // Clicking the extracted actions should still target the same dock window instance.
    actionSpecs[2]?.onClick();
    actionSpecs[3]?.onClick();
    actionSpecs[4]?.onClick();
    actionSpecs[5]?.onClick();
    actionSpecs[6]?.onClick();

    expect(onShowInCanvas).toHaveBeenCalledWith("dock-1");
    expect(onUndockWindow).toHaveBeenCalledWith("dock-1");
    expect(onMaximizeWindow).toHaveBeenCalledWith("dock-1");
    expect(onMinimizeWindow).toHaveBeenCalledWith("dock-1");
    expect(onCloseWindow).toHaveBeenCalledWith("dock-1");
  });
});

describe("buildFloatingWindowActionSpecs", () => {
  it("omits the canvas action for tracked git graph windows", () => {
    const onShowInCanvas = vi.fn();
    const onDockWindow = vi.fn();
    const onMaximizeWindow = vi.fn();
    const onMinimizeWindow = vi.fn();
    const onCloseWindow = vi.fn();

    const actionSpecs = buildFloatingWindowActionSpecs({
      window: {
        instanceId: "floating-git",
        title: "Git Graph",
        mode: ChatWindowModeEnum.git_graph_mode,
      },
      onShowInCanvas,
      onDockWindow,
      onMaximizeWindow,
      onMinimizeWindow,
      onCloseWindow,
    });

    // Git graph windows should keep the same four floating actions and never expose the canvas re-open control.
    expect(actionSpecs.map((action) => action.key)).toEqual([
      "dock",
      "maximize",
      "minimize",
      "close",
    ]);

    actionSpecs[0]?.onClick();

    expect(onShowInCanvas).not.toHaveBeenCalled();
    expect(onDockWindow).toHaveBeenCalledWith("floating-git");
  });
});

describe("buildMaximizedWindowActionSpecs", () => {
  it("keeps restore and dock actions ahead of minimize and close", () => {
    const onShowInCanvas = vi.fn();
    const onRestoreWindow = vi.fn();
    const onDockWindow = vi.fn();
    const onMinimizeWindow = vi.fn();
    const onCloseWindow = vi.fn();

    const actionSpecs = buildMaximizedWindowActionSpecs({
      window: {
        instanceId: "max-1",
        title: "Chat Window 1",
        mode: ChatWindowModeEnum.project_ai_mode,
      },
      onShowInCanvas,
      onRestoreWindow,
      onDockWindow,
      onMinimizeWindow,
      onCloseWindow,
    });

    // The maximized header must preserve the restore-first action ordering used by the main dock surface.
    expect(actionSpecs.map((action) => action.key)).toEqual([
      "show_in_canvas",
      "restore",
      "dock",
      "minimize",
      "close",
    ]);

    actionSpecs[1]?.onClick();
    actionSpecs[2]?.onClick();

    expect(onRestoreWindow).toHaveBeenCalledWith("max-1");
    expect(onDockWindow).toHaveBeenCalledWith("max-1");
  });
});
