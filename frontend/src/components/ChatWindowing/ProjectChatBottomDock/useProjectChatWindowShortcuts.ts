import {
  getNormalizedEventCode,
  isShortcutPressed,
  parseShortcut,
  resolveChatWindowingShortcuts,
} from "components/ChatWindowing/projectChatKeyboardShortcuts";
import { type FloatingSnapPreset } from "components/ChatWindowing/projectChatSnapLayout";
import { useEffect } from "react";
import {
  focusProjectChatWindow,
  maximizeProjectChatWindow,
} from "state/actions/projectChatWindowing";
import { isMacOs } from "utils/utils";
import {
  type ChatWindowExitAnimationKind,
  SNAP_BOTTOM_LEFT_SHORTCUT,
  SNAP_BOTTOM_RIGHT_SHORTCUT,
  SNAP_TOP_LEFT_SHORTCUT,
  SNAP_TOP_RIGHT_SHORTCUT,
  type ShortcutCommand,
  isEditableTarget,
} from "./shared";

type UseProjectChatWindowShortcutsInput = {
  activeVisibleWindowId: string | null;
  chatWindowingShortcuts: ReturnType<typeof resolveChatWindowingShortcuts>;
  hasOverlayWindows: boolean;
  setIsCanvasVisibilitySuppressed: (
    next: boolean | ((current: boolean) => boolean),
  ) => void;
  snapWindowTargetByPreset: (preset: FloatingSnapPreset) => void;
  startWindowExitAnimation: (
    instanceId: string,
    kind: ChatWindowExitAnimationKind,
    options?: { focusAfterClose?: boolean },
  ) => void;
};

export function useProjectChatWindowShortcuts({
  activeVisibleWindowId,
  chatWindowingShortcuts,
  hasOverlayWindows,
  setIsCanvasVisibilitySuppressed,
  snapWindowTargetByPreset,
  startWindowExitAnimation,
}: UseProjectChatWindowShortcutsInput): void {
  useEffect(() => {
    const parsedCanvasToggle = parseShortcut(
      chatWindowingShortcuts.canvasToggle,
    );
    const parsedMaximizeFocused = parseShortcut(
      chatWindowingShortcuts.maximizeFocused,
    );
    const parsedMinimizeFocused = parseShortcut(
      chatWindowingShortcuts.minimizeFocused,
    );
    const parsedSnapLeft = parseShortcut(chatWindowingShortcuts.snapLeft);
    const parsedSnapRight = parseShortcut(chatWindowingShortcuts.snapRight);
    const parsedSnapTop = parseShortcut(chatWindowingShortcuts.snapTop);
    const parsedSnapBottom = parseShortcut(chatWindowingShortcuts.snapBottom);
    const parsedSnapTopLeft = parseShortcut(SNAP_TOP_LEFT_SHORTCUT);
    const parsedSnapTopRight = parseShortcut(SNAP_TOP_RIGHT_SHORTCUT);
    const parsedSnapBottomLeft = parseShortcut(SNAP_BOTTOM_LEFT_SHORTCUT);
    const parsedSnapBottomRight = parseShortcut(SNAP_BOTTOM_RIGHT_SHORTCUT);
    const macOs = isMacOs();
    const shortcutCommands: ShortcutCommand[] = [
      ...(hasOverlayWindows
        ? [
            {
              shortcut: parsedCanvasToggle,
              run: () => {
                setIsCanvasVisibilitySuppressed((current) => !current);
              },
            },
          ]
        : []),
      ...(activeVisibleWindowId
        ? [
            {
              shortcut: parsedMaximizeFocused,
              run: () => {
                maximizeProjectChatWindow(activeVisibleWindowId);
                focusProjectChatWindow(activeVisibleWindowId);
                setIsCanvasVisibilitySuppressed(false);
              },
            },
            {
              shortcut: parsedMinimizeFocused,
              run: () => {
                startWindowExitAnimation(activeVisibleWindowId, "minimize", {
                  focusAfterClose: true,
                });
              },
            },
          ]
        : []),
      {
        shortcut: parsedSnapLeft,
        run: () => {
          snapWindowTargetByPreset("left");
        },
      },
      {
        shortcut: parsedSnapRight,
        run: () => {
          snapWindowTargetByPreset("right");
        },
      },
      {
        shortcut: parsedSnapTop,
        run: () => {
          snapWindowTargetByPreset("top");
        },
      },
      {
        shortcut: parsedSnapBottom,
        run: () => {
          snapWindowTargetByPreset("bottom");
        },
      },
      {
        shortcut: parsedSnapTopLeft,
        run: () => {
          snapWindowTargetByPreset("top_left");
        },
      },
      {
        shortcut: parsedSnapTopRight,
        run: () => {
          snapWindowTargetByPreset("top_right");
        },
      },
      {
        shortcut: parsedSnapBottomLeft,
        run: () => {
          snapWindowTargetByPreset("bottom_left");
        },
      },
      {
        shortcut: parsedSnapBottomRight,
        run: () => {
          snapWindowTargetByPreset("bottom_right");
        },
      },
    ];

    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        isEditableTarget(event.target)
      ) {
        return;
      }
      const eventCode = getNormalizedEventCode(event);
      const matchingCommand = shortcutCommands.find(({ shortcut }) =>
        isShortcutPressed(event, eventCode, shortcut, macOs),
      );
      if (!matchingCommand) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      matchingCommand.run();
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [
    activeVisibleWindowId,
    chatWindowingShortcuts.canvasToggle,
    chatWindowingShortcuts.maximizeFocused,
    chatWindowingShortcuts.minimizeFocused,
    chatWindowingShortcuts.snapBottom,
    chatWindowingShortcuts.snapLeft,
    chatWindowingShortcuts.snapRight,
    chatWindowingShortcuts.snapTop,
    hasOverlayWindows,
    snapWindowTargetByPreset,
    startWindowExitAnimation,
  ]);
}
