import type { ComponentType, ReactNode, RefObject } from "react";

export type WorkspaceShellPane = "leading" | "trailing";

export type WorkspaceShellPaneViewState = {
  selectedTabId: string;
  visible: boolean;
  width: number;
  rememberedNonFullWidth: number;
};

export type WorkspaceShellOutlineViewState = {
  collapsedGroupIds: Array<string>;
  focusedSectionId: string | null;
};

// Shell view state is deliberately separate from WorkspaceDocument. A host may serialize and
// persist this controlled value without introducing pane state into the canonical workspace.
export type WorkspaceShellViewState = {
  leading: WorkspaceShellPaneViewState;
  trailing: WorkspaceShellPaneViewState;
  outline: WorkspaceShellOutlineViewState;
};

export type WorkspaceShellTabIconProps = {
  className?: string;
  "aria-hidden"?: boolean;
  focusable?: "false";
};

export type WorkspaceShellTabContentProps = {
  pane: WorkspaceShellPane;
  tabId: string;
  closePane: () => void;
};

export type WorkspaceShellTabDefinition = {
  id: string;
  label: string;
  icon: ComponentType<WorkspaceShellTabIconProps>;
  renderContent: (props: WorkspaceShellTabContentProps) => ReactNode;
  // Programmatic pane opening normally focuses the selected rail tab. A host may request one
  // specific control in its own content without receiving any package store or private selector.
  initialFocusRef?: RefObject<HTMLElement | null>;
};

export type WorkspaceShellLeadingPaneCameraMode = "shift-with-pane" | "preserve-screen-position";

export type WorkspaceShellProps = {
  viewState: WorkspaceShellViewState;
  onViewStateChange: (nextState: WorkspaceShellViewState) => void;
  // Package tabs are composed before these host extensions. `outline` is reserved by the
  // built-in leading tab and therefore fails the same duplicate-id validation as any collision.
  leadingTabs: ReadonlyArray<WorkspaceShellTabDefinition>;
  trailingTabs: ReadonlyArray<WorkspaceShellTabDefinition>;
  // Frozen main's default setting shifts the map with the leading pane. In an integrated shell,
  // the center's logical origin already shifts with that pane. The alternate mode explicitly
  // counter-pans the camera to preserve absolute screen position.
  leadingPaneCameraMode?: WorkspaceShellLeadingPaneCameraMode;
  ariaLabel?: string;
  className?: string;
};
