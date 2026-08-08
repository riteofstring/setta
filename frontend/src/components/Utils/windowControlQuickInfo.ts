import { getFloatingBoxHandlers } from "./FloatingBox";

type WindowControlQuickInfoAction =
  | "close_window"
  | "create_chat_window"
  | "dock_window"
  | "float_window"
  | "focus_window"
  | "hide_window"
  | "maximize_window"
  | "minimize_window"
  | "open_section_in_window"
  | "reopen_window"
  | "restore_window"
  | "show_canvas"
  | "show_chats"
  | "show_chat_windows"
  | "show_in_canvas"
  | "show_more_chat_windows"
  | "show_next_docked_chat"
  | "show_previous_chat_windows"
  | "show_previous_docked_chat"
  | "show_section_in_canvas"
  | "undock_window";

type WindowControlQuickInfoArgs = {
  action: WindowControlQuickInfoAction;
  title?: string | null;
};

type WindowControlQuickInfoBuilder = (title?: string | null) => string;

function withOptionalTitle(
  prefix: string,
  fallback: string,
  title?: string | null,
): string {
  const normalizedTitle = title?.trim();
  if (!normalizedTitle) {
    return fallback;
  }
  return `${prefix} ${normalizedTitle}`;
}

function buildStaticQuickInfo(text: string): WindowControlQuickInfoBuilder {
  return () => text;
}

function buildWindowActionQuickInfo(
  prefix: string,
  fallback: string,
): WindowControlQuickInfoBuilder {
  return (title) => withOptionalTitle(prefix, fallback, title);
}

function buildShowInCanvasQuickInfo(title?: string | null): string {
  const normalizedTitle = title?.trim();
  if (!normalizedTitle) {
    return "Show in canvas";
  }
  return `Show ${normalizedTitle} in canvas`;
}

const windowControlQuickInfoBuilders: Record<
  WindowControlQuickInfoAction,
  WindowControlQuickInfoBuilder
> = {
  close_window: buildWindowActionQuickInfo("Close", "Close window"),
  create_chat_window: buildStaticQuickInfo("Create chat window"),
  dock_window: buildWindowActionQuickInfo("Dock", "Dock window"),
  float_window: buildWindowActionQuickInfo("Float", "Float window"),
  focus_window: buildWindowActionQuickInfo("Focus", "Focus window"),
  hide_window: buildWindowActionQuickInfo("Hide", "Hide window"),
  maximize_window: buildWindowActionQuickInfo("Maximize", "Maximize window"),
  minimize_window: buildWindowActionQuickInfo("Minimize", "Minimize window"),
  open_section_in_window: buildStaticQuickInfo(
    "Open section in floating window",
  ),
  reopen_window: buildWindowActionQuickInfo("Reopen", "Reopen window"),
  restore_window: buildWindowActionQuickInfo("Restore", "Restore window"),
  show_canvas: buildStaticQuickInfo("Show canvas"),
  show_chats: buildStaticQuickInfo("Show chats"),
  show_chat_windows: buildStaticQuickInfo("Show chat windows"),
  show_in_canvas: buildShowInCanvasQuickInfo,
  show_more_chat_windows: buildStaticQuickInfo("Show more chat windows"),
  show_next_docked_chat: buildStaticQuickInfo("Show next docked chat"),
  show_previous_chat_windows: buildStaticQuickInfo(
    "Show previous chat windows",
  ),
  show_previous_docked_chat: buildStaticQuickInfo("Show previous docked chat"),
  show_section_in_canvas: buildStaticQuickInfo("Show section in canvas"),
  undock_window: buildWindowActionQuickInfo("Undock", "Undock window"),
};

export function getWindowControlQuickInfoText({
  action,
  title,
}: WindowControlQuickInfoArgs): string {
  return windowControlQuickInfoBuilders[action](title);
}

export function getWindowControlQuickInfoHandlers(
  args: WindowControlQuickInfoArgs,
) {
  return getFloatingBoxHandlers({
    content: getWindowControlQuickInfoText(args),
  });
}
