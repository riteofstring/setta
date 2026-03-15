import {
  SECTION_WINDOW_ACTION_BUTTON_CLASS,
  SECTION_WINDOW_CLOSE_BUTTON_CLASS,
  SECTION_WINDOW_MINIMIZE_BUTTON_CLASS,
} from "components/ChatWindowing/ProjectChatWindowSurface";
import type { ProjectChatWindowActionSpec } from "components/ChatWindowing/projectChatWindowShell";
import {
  MdChevronLeft,
  MdChevronRight,
  MdFlipToFront,
  MdOpenInNew,
  MdVerticalAlignBottom,
} from "react-icons/md";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
} from "utils/generatedTypes";
import type {
  ChatWindowEnterAnimationKind,
  ChatWindowExitAnimationKind,
  ResolvedWindowPill,
} from "./projectChatBottomDockTypes";

type ActionableWindow = Pick<
  ResolvedWindowPill,
  "instanceId" | "mode" | "title"
>;

type WindowCanvasActionHandlers = {
  onShowInCanvas: (instanceId: string) => void;
};

const WINDOW_MAXIMIZE_ICON = <i className="gg-maximize !scale-[.4]" />;

export const DOCKED_CHAT_WINDOW_SHADOW_CLASS =
  "shadow-[0_-1px_6px_rgba(15,23,42,0.08)] dark:shadow-[0_-1px_6px_rgba(0,0,0,0.18)]";
export const FLOATING_CHAT_WINDOW_SHADOW_CLASS =
  "shadow-[0_2px_8px_rgba(15,23,42,0.10)] dark:shadow-[0_2px_10px_rgba(0,0,0,0.22)]";
export const WINDOWED_CHAT_ROUNDED_CLASS = "rounded-lg";
export const DOCKED_WINDOWED_CHAT_ROUNDED_CLASS = "rounded-b-none rounded-t-lg";

export function canMoveProjectChatWindowToCanvas(
  mode: ResolvedWindowPill["mode"],
): boolean {
  return mode !== ChatWindowModeEnum.git_graph_mode;
}

function buildSharedCanvasWindowActions(
  window: ActionableWindow,
  handlers: WindowCanvasActionHandlers,
): Array<ProjectChatWindowActionSpec> {
  return [
    ...(canMoveProjectChatWindowToCanvas(window.mode)
      ? [
          {
            key: "show_in_canvas",
            quickInfoAction: "show_in_canvas" as const,
            title: window.title,
            testId: "project-chat-window-show-in-canvas",
            instanceId: window.instanceId,
            icon: <MdFlipToFront size={12} />,
            onClick: () => {
              handlers.onShowInCanvas(window.instanceId);
            },
          },
        ]
      : []),
  ];
}

export function buildDockedWindowActionSpecs({
  window,
  showDockHeaderCycleControls,
  canCycleDockBackward,
  canCycleDockForward,
  onCycleDockWindowsBackward,
  onCycleDockWindowsForward,
  onShowInCanvas,
  onUndockWindow,
  onMaximizeWindow,
  onMinimizeWindow,
  onCloseWindow,
}: {
  window: ActionableWindow;
  showDockHeaderCycleControls: boolean;
  canCycleDockBackward: boolean;
  canCycleDockForward: boolean;
  onCycleDockWindowsBackward: () => void;
  onCycleDockWindowsForward: () => void;
  onShowInCanvas: (instanceId: string) => void;
  onUndockWindow: (instanceId: string) => void;
  onMaximizeWindow: (instanceId: string) => void;
  onMinimizeWindow: (instanceId: string) => void;
  onCloseWindow: (instanceId: string) => void;
}): Array<ProjectChatWindowActionSpec> {
  return [
    ...(showDockHeaderCycleControls
      ? [
          {
            key: "cycle_left",
            quickInfoAction: "show_previous_docked_chat" as const,
            testId: "project-chat-window-cycle-left",
            instanceId: window.instanceId,
            icon: <MdChevronLeft size={12} />,
            className: `${SECTION_WINDOW_ACTION_BUTTON_CLASS} disabled:cursor-not-allowed disabled:opacity-35`,
            disabled: !canCycleDockBackward,
            onClick: onCycleDockWindowsBackward,
          },
          {
            key: "cycle_right",
            quickInfoAction: "show_next_docked_chat" as const,
            testId: "project-chat-window-cycle-right",
            instanceId: window.instanceId,
            icon: <MdChevronRight size={12} />,
            className: `${SECTION_WINDOW_ACTION_BUTTON_CLASS} disabled:cursor-not-allowed disabled:opacity-35`,
            disabled: !canCycleDockForward,
            onClick: onCycleDockWindowsForward,
          },
        ]
      : []),
    ...buildSharedCanvasWindowActions(window, {
      onShowInCanvas,
    }),
    {
      key: "undock",
      quickInfoAction: "undock_window" as const,
      title: window.title,
      testId: "project-chat-window-undock",
      instanceId: window.instanceId,
      icon: <MdOpenInNew size={12} />,
      onClick: () => {
        onUndockWindow(window.instanceId);
      },
    },
    {
      key: "maximize",
      quickInfoAction: "maximize_window" as const,
      title: window.title,
      testId: "project-chat-window-maximize",
      instanceId: window.instanceId,
      icon: WINDOW_MAXIMIZE_ICON,
      onClick: () => {
        onMaximizeWindow(window.instanceId);
      },
    },
    {
      key: "minimize",
      quickInfoAction: "minimize_window" as const,
      title: window.title,
      testId: "project-chat-window-minimize",
      instanceId: window.instanceId,
      className: SECTION_WINDOW_MINIMIZE_BUTTON_CLASS,
      icon: <i className="gg-math-minus" />,
      onClick: () => {
        onMinimizeWindow(window.instanceId);
      },
    },
    {
      key: "close",
      quickInfoAction: "close_window" as const,
      title: window.title,
      testId: "project-chat-window-close",
      instanceId: window.instanceId,
      className: SECTION_WINDOW_CLOSE_BUTTON_CLASS,
      icon: <i className="gg-close" />,
      onClick: () => {
        onCloseWindow(window.instanceId);
      },
    },
  ];
}

export function buildFloatingWindowActionSpecs({
  window,
  onShowInCanvas,
  onDockWindow,
  onMaximizeWindow,
  onMinimizeWindow,
  onCloseWindow,
}: {
  window: ActionableWindow;
  onShowInCanvas: (instanceId: string) => void;
  onDockWindow: (instanceId: string) => void;
  onMaximizeWindow: (instanceId: string) => void;
  onMinimizeWindow: (instanceId: string) => void;
  onCloseWindow: (instanceId: string) => void;
}): Array<ProjectChatWindowActionSpec> {
  return [
    ...buildSharedCanvasWindowActions(window, {
      onShowInCanvas,
    }),
    {
      key: "dock",
      quickInfoAction: "dock_window" as const,
      title: window.title,
      testId: "project-chat-window-dock",
      instanceId: window.instanceId,
      icon: <MdVerticalAlignBottom size={12} />,
      onClick: () => {
        onDockWindow(window.instanceId);
      },
    },
    {
      key: "maximize",
      quickInfoAction: "maximize_window" as const,
      title: window.title,
      testId: "project-chat-window-maximize",
      instanceId: window.instanceId,
      icon: WINDOW_MAXIMIZE_ICON,
      onClick: () => {
        onMaximizeWindow(window.instanceId);
      },
    },
    {
      key: "minimize",
      quickInfoAction: "minimize_window" as const,
      title: window.title,
      testId: "project-chat-window-minimize",
      instanceId: window.instanceId,
      className: SECTION_WINDOW_MINIMIZE_BUTTON_CLASS,
      icon: <i className="gg-math-minus" />,
      onClick: () => {
        onMinimizeWindow(window.instanceId);
      },
    },
    {
      key: "close",
      quickInfoAction: "close_window" as const,
      title: window.title,
      testId: "project-chat-window-close",
      instanceId: window.instanceId,
      className: SECTION_WINDOW_CLOSE_BUTTON_CLASS,
      icon: <i className="gg-close" />,
      onClick: () => {
        onCloseWindow(window.instanceId);
      },
    },
  ];
}

export function buildMaximizedWindowActionSpecs({
  window,
  onShowInCanvas,
  onRestoreWindow,
  onDockWindow,
  onMinimizeWindow,
  onCloseWindow,
}: {
  window: ActionableWindow;
  onShowInCanvas: (instanceId: string) => void;
  onRestoreWindow: (instanceId: string) => void;
  onDockWindow: (instanceId: string) => void;
  onMinimizeWindow: (instanceId: string) => void;
  onCloseWindow: (instanceId: string) => void;
}): Array<ProjectChatWindowActionSpec> {
  return [
    ...buildSharedCanvasWindowActions(window, {
      onShowInCanvas,
    }),
    {
      key: "restore",
      quickInfoAction: "restore_window" as const,
      title: window.title,
      testId: "project-chat-window-restore",
      instanceId: window.instanceId,
      icon: <MdFlipToFront size={12} />,
      onClick: () => {
        onRestoreWindow(window.instanceId);
      },
    },
    {
      key: "dock",
      quickInfoAction: "dock_window" as const,
      title: window.title,
      testId: "project-chat-window-dock",
      instanceId: window.instanceId,
      icon: <MdVerticalAlignBottom size={12} />,
      onClick: () => {
        onDockWindow(window.instanceId);
      },
    },
    {
      key: "minimize",
      quickInfoAction: "minimize_window" as const,
      title: window.title,
      testId: "project-chat-window-minimize",
      instanceId: window.instanceId,
      className: SECTION_WINDOW_MINIMIZE_BUTTON_CLASS,
      icon: <i className="gg-math-minus" />,
      onClick: () => {
        onMinimizeWindow(window.instanceId);
      },
    },
    {
      key: "close",
      quickInfoAction: "close_window" as const,
      title: window.title,
      testId: "project-chat-window-close",
      instanceId: window.instanceId,
      className: SECTION_WINDOW_CLOSE_BUTTON_CLASS,
      icon: <i className="gg-close" />,
      onClick: () => {
        onCloseWindow(window.instanceId);
      },
    },
  ];
}

export function getChatWindowExitAnimationClass(
  kind: ChatWindowExitAnimationKind | null,
  placement: ChatWindowPlacementEnum,
): string {
  if (!kind) {
    return "";
  }
  const originClassName =
    placement === ChatWindowPlacementEnum.maximized
      ? "origin-center"
      : placement === ChatWindowPlacementEnum.bottom_docked
        ? "origin-bottom-right"
        : "origin-top-right";
  if (kind === "minimize") {
    return `${originClassName} pointer-events-none transform-gpu will-change-[transform,opacity] transition-[transform,opacity] duration-[115ms] ease-[cubic-bezier(0.2,0.82,0.32,1)] motion-reduce:transition-none translate-y-4 scale-[0.97] opacity-0`;
  }
  return `${originClassName} pointer-events-none transform-gpu will-change-[transform,opacity] transition-[transform,opacity] duration-[125ms] ease-[cubic-bezier(0.32,0,0.18,1)] motion-reduce:transition-none scale-[0.7] opacity-0`;
}

export function getChatWindowEnterAnimationClass(
  kind: ChatWindowEnterAnimationKind | null,
  placement: ChatWindowPlacementEnum,
): string {
  if (!kind) {
    return "";
  }
  const originClassName =
    placement === ChatWindowPlacementEnum.maximized
      ? "origin-center"
      : placement === ChatWindowPlacementEnum.bottom_docked
        ? "origin-bottom-right"
        : "origin-top-right";
  return `${originClassName} transform-gpu will-change-[transform,opacity] transition-[transform,opacity] duration-[110ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none translate-y-5 scale-[0.985] opacity-0`;
}
