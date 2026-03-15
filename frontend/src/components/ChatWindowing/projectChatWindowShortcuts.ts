import { type FloatingSnapPreset } from "components/ChatWindowing/projectChatSnapLayout";
import { useEffect } from "react";
import {
  getNormalizedEventCode,
  isShortcutPressed,
  parseShortcut,
  type ParsedShortcut,
} from "state/actions/keyShortcutMatching";
import { isMacOs } from "utils/utils";

type ProjectChatWindowShortcuts = {
  canvasToggle: string;
  maximizeFocused: string;
  minimizeFocused: string;
  snapLeft: string;
  snapRight: string;
  snapTop: string;
  snapBottom: string;
  snapTopLeft: string;
  snapTopRight: string;
  snapBottomLeft: string;
  snapBottomRight: string;
};

type UseProjectChatWindowShortcutsArgs = {
  shortcuts: ProjectChatWindowShortcuts;
  hasOverlayWindows: boolean;
  hasActiveVisibleWindow: boolean;
  onToggleCanvasVisibility: () => void;
  onMaximizeFocusedWindow: (() => void) | null;
  onMinimizeFocusedWindow: (() => void) | null;
  onSnapPreset: (preset: FloatingSnapPreset) => void;
};

function isEditableProjectChatShortcutTarget(
  target: EventTarget | null,
): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  ) {
    return true;
  }
  if (target.isContentEditable) {
    return true;
  }
  return Boolean(target.closest("[contenteditable='true']"));
}

function matchesProjectChatWindowShortcut(
  event: KeyboardEvent,
  parsedShortcut: ParsedShortcut,
  isMacOsHost: boolean,
): boolean {
  const eventCode = getNormalizedEventCode(event);
  const pressedKeys = eventCode ? new Set([eventCode]) : new Set<string>();
  return isShortcutPressed(event, parsedShortcut, isMacOsHost, pressedKeys);
}

function parseProjectChatWindowShortcut(shortcut: string): ParsedShortcut {
  return parseShortcut(shortcut.toLowerCase());
}

export function useProjectChatWindowShortcuts({
  shortcuts,
  hasOverlayWindows,
  hasActiveVisibleWindow,
  onToggleCanvasVisibility,
  onMaximizeFocusedWindow,
  onMinimizeFocusedWindow,
  onSnapPreset,
}: UseProjectChatWindowShortcutsArgs) {
  useEffect(() => {
    const parsedCanvasToggle = parseProjectChatWindowShortcut(
      shortcuts.canvasToggle,
    );
    const parsedMaximizeFocused = parseProjectChatWindowShortcut(
      shortcuts.maximizeFocused,
    );
    const parsedMinimizeFocused = parseProjectChatWindowShortcut(
      shortcuts.minimizeFocused,
    );
    const parsedSnapLeft = parseProjectChatWindowShortcut(shortcuts.snapLeft);
    const parsedSnapRight = parseProjectChatWindowShortcut(shortcuts.snapRight);
    const parsedSnapTop = parseProjectChatWindowShortcut(shortcuts.snapTop);
    const parsedSnapBottom = parseProjectChatWindowShortcut(
      shortcuts.snapBottom,
    );
    const parsedSnapTopLeft = parseProjectChatWindowShortcut(
      shortcuts.snapTopLeft,
    );
    const parsedSnapTopRight = parseProjectChatWindowShortcut(
      shortcuts.snapTopRight,
    );
    const parsedSnapBottomLeft = parseProjectChatWindowShortcut(
      shortcuts.snapBottomLeft,
    );
    const parsedSnapBottomRight = parseProjectChatWindowShortcut(
      shortcuts.snapBottomRight,
    );
    const isMacOsHost = isMacOs();

    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        isEditableProjectChatShortcutTarget(event.target)
      ) {
        return;
      }

      if (
        hasOverlayWindows &&
        matchesProjectChatWindowShortcut(event, parsedCanvasToggle, isMacOsHost)
      ) {
        event.preventDefault();
        event.stopPropagation();
        onToggleCanvasVisibility();
        return;
      }

      if (
        hasActiveVisibleWindow &&
        onMaximizeFocusedWindow &&
        matchesProjectChatWindowShortcut(
          event,
          parsedMaximizeFocused,
          isMacOsHost,
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
        onMaximizeFocusedWindow();
        return;
      }

      if (
        hasActiveVisibleWindow &&
        onMinimizeFocusedWindow &&
        matchesProjectChatWindowShortcut(
          event,
          parsedMinimizeFocused,
          isMacOsHost,
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
        onMinimizeFocusedWindow();
        return;
      }

      if (
        matchesProjectChatWindowShortcut(event, parsedSnapLeft, isMacOsHost)
      ) {
        event.preventDefault();
        event.stopPropagation();
        onSnapPreset("left");
        return;
      }

      if (
        matchesProjectChatWindowShortcut(event, parsedSnapRight, isMacOsHost)
      ) {
        event.preventDefault();
        event.stopPropagation();
        onSnapPreset("right");
        return;
      }

      if (matchesProjectChatWindowShortcut(event, parsedSnapTop, isMacOsHost)) {
        event.preventDefault();
        event.stopPropagation();
        onSnapPreset("top");
        return;
      }

      if (
        matchesProjectChatWindowShortcut(event, parsedSnapBottom, isMacOsHost)
      ) {
        event.preventDefault();
        event.stopPropagation();
        onSnapPreset("bottom");
        return;
      }

      if (
        matchesProjectChatWindowShortcut(event, parsedSnapTopLeft, isMacOsHost)
      ) {
        event.preventDefault();
        event.stopPropagation();
        onSnapPreset("top_left");
        return;
      }

      if (
        matchesProjectChatWindowShortcut(event, parsedSnapTopRight, isMacOsHost)
      ) {
        event.preventDefault();
        event.stopPropagation();
        onSnapPreset("top_right");
        return;
      }

      if (
        matchesProjectChatWindowShortcut(
          event,
          parsedSnapBottomLeft,
          isMacOsHost,
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
        onSnapPreset("bottom_left");
        return;
      }

      if (
        matchesProjectChatWindowShortcut(
          event,
          parsedSnapBottomRight,
          isMacOsHost,
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
        onSnapPreset("bottom_right");
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [
    hasActiveVisibleWindow,
    hasOverlayWindows,
    onMaximizeFocusedWindow,
    onMinimizeFocusedWindow,
    onSnapPreset,
    onToggleCanvasVisibility,
    shortcuts.canvasToggle,
    shortcuts.maximizeFocused,
    shortcuts.minimizeFocused,
    shortcuts.snapBottom,
    shortcuts.snapBottomLeft,
    shortcuts.snapBottomRight,
    shortcuts.snapLeft,
    shortcuts.snapRight,
    shortcuts.snapTop,
    shortcuts.snapTopLeft,
    shortcuts.snapTopRight,
  ]);
}
