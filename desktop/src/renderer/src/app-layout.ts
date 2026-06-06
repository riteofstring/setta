export const chatPaneDefaultWidth = 360;
export const chatPaneMaxWidth = 560;
export const chatPaneMinWidth = 160;
export const projectPaneDefaultWidth = 220;
export const projectPaneMaxWidth = 320;
export const projectPaneMinWidth = 128;
export const bottomPaneDefaultHeight = 288;
export const bottomPaneMinHeight = 88;

const compactLayoutBreakpoint = 760;
const singleContentPaneBreakpoint = 560;
const bottomPaneCompactShare = 0.34;
const chatPaneCompactShare = 0.34;
const projectPaneCompactShare = 0.28;

export type MaximizedPane = "bottom" | "chat" | "right" | null;

export interface PaneVisibility {
  bottom: boolean;
  chat: boolean;
  content: boolean;
  project: boolean;
  right: boolean;
}

export function paneVisibility({
  bottomPaneOpen,
  chatPaneOpen,
  maximizedPane,
  projectPaneOpen,
  rightPaneOpen,
  viewportWidth,
}: {
  bottomPaneOpen: boolean;
  chatPaneOpen: boolean;
  maximizedPane: MaximizedPane;
  projectPaneOpen: boolean;
  rightPaneOpen: boolean;
  viewportWidth: number;
}): PaneVisibility {
  const chatBase = panelIsVisible(chatPaneOpen, maximizedPane, "chat");
  const rightBase = panelIsVisible(rightPaneOpen, maximizedPane, "right");
  const bottom = panelIsVisible(bottomPaneOpen, maximizedPane, "bottom");
  const projectBase = projectPaneIsVisible(projectPaneOpen, maximizedPane);
  if (viewportWidth < singleContentPaneBreakpoint) {
    const right = rightBase;
    const chat = !right && chatBase;
    const content = contentPanelsAreVisible(maximizedPane, chat, right);
    return {
      bottom,
      chat,
      content,
      project: maximizedPane === null && !content && projectBase,
      right,
    };
  }
  const chat = chatBase;
  const right = rightBase;
  return {
    bottom,
    chat,
    content: contentPanelsAreVisible(maximizedPane, chat, right),
    project: projectBase,
    right,
  };
}

export function compactProjectPaneWidth(width: number, viewportWidth: number) {
  return compactPaneWidth(width, viewportWidth, projectPaneMinWidth, projectPaneCompactShare);
}

export function compactChatPaneWidth(width: number, viewportWidth: number) {
  return compactPaneWidth(width, viewportWidth, chatPaneMinWidth, chatPaneCompactShare);
}

export function compactPaneWidth(
  width: number,
  viewportWidth: number,
  minWidth: number,
  compactShare: number,
) {
  if (viewportWidth >= compactLayoutBreakpoint) {
    return width;
  }
  const compactMaxWidth = Math.max(minWidth, Math.floor(viewportWidth * compactShare));
  return Math.min(width, compactMaxWidth);
}

export function compactBottomPaneHeight(height: number, viewportHeight: number) {
  if (viewportHeight >= compactLayoutBreakpoint) {
    return height;
  }
  const compactMaxHeight = Math.max(
    bottomPaneMinHeight,
    Math.floor(viewportHeight * bottomPaneCompactShare),
  );
  return Math.min(height, compactMaxHeight);
}

function panelIsVisible(
  open: boolean,
  maximizedPane: MaximizedPane,
  pane: NonNullable<MaximizedPane>,
) {
  return open && (maximizedPane === null || maximizedPane === pane);
}

function contentPanelsAreVisible(maximizedPane: MaximizedPane, chat: boolean, right: boolean) {
  return maximizedPane !== "bottom" && (chat || right);
}

function projectPaneIsVisible(projectPaneOpen: boolean, maximizedPane: MaximizedPane) {
  return projectPaneOpen || maximizedPane !== null;
}
