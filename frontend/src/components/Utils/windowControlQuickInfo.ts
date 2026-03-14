import { getFloatingBoxHandlers } from "./FloatingBox";

export type WindowControlQuickInfoAction =
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

export function getWindowControlQuickInfoText({
  action,
  title,
}: WindowControlQuickInfoArgs): string {
  switch (action) {
    case "close_window":
      return withOptionalTitle("Close", "Close window", title);
    case "create_chat_window":
      return "Create chat window";
    case "dock_window":
      return withOptionalTitle("Dock", "Dock window", title);
    case "float_window":
      return withOptionalTitle("Float", "Float window", title);
    case "focus_window":
      return withOptionalTitle("Focus", "Focus window", title);
    case "hide_window":
      return withOptionalTitle("Hide", "Hide window", title);
    case "maximize_window":
      return withOptionalTitle("Maximize", "Maximize window", title);
    case "minimize_window":
      return withOptionalTitle("Minimize", "Minimize window", title);
    case "open_section_in_window":
      return "Open section in floating window";
    case "reopen_window":
      return withOptionalTitle("Reopen", "Reopen window", title);
    case "restore_window":
      return withOptionalTitle("Restore", "Restore window", title);
    case "show_canvas":
      return "Show canvas";
    case "show_chats":
      return "Show chats";
    case "show_chat_windows":
      return "Show chat windows";
    case "show_in_canvas":
      return title?.trim() ? `Show ${title.trim()} in canvas` : "Show in canvas";
    case "show_more_chat_windows":
      return "Show more chat windows";
    case "show_next_docked_chat":
      return "Show next docked chat";
    case "show_previous_chat_windows":
      return "Show previous chat windows";
    case "show_previous_docked_chat":
      return "Show previous docked chat";
    case "show_section_in_canvas":
      return "Show section in canvas";
    case "undock_window":
      return withOptionalTitle("Undock", "Undock window", title);
  }
}

export function getWindowControlQuickInfoHandlers(
  args: WindowControlQuickInfoArgs,
) {
  return getFloatingBoxHandlers({
    content: getWindowControlQuickInfoText(args),
  });
}
