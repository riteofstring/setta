import type { ComponentType, ReactNode, RefObject } from "react";
import type { WorkspaceSectionTagColorPalette } from "../section/sectionTagColors";

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
  // An unavailable tab remains discoverable in the rail but cannot be selected or receive roving
  // tab focus. Hosts own the contextual availability decision.
  disabled?: boolean;
  // Programmatic pane opening normally focuses the selected rail tab. A host may request one
  // specific control in its own content without receiving any package store or private selector.
  initialFocusRef?: RefObject<HTMLElement | null>;
};

export type WorkspaceShellProps = {
  viewState: WorkspaceShellViewState;
  onViewStateChange: (nextState: WorkspaceShellViewState) => void;
  // The built-in Outline is composed before these host extensions. `outline` is always reserved;
  // `inspector` is reserved only while includeBuiltInInspector is enabled.
  leadingTabs: ReadonlyArray<WorkspaceShellTabDefinition>;
  trailingTabs: ReadonlyArray<WorkspaceShellTabDefinition>;
  // Enabled by default for the package's generic editor. Hosts that compose their own complete
  // trailing rail can opt out without changing the shell's pane mechanics.
  includeBuiltInInspector?: boolean;
  // Mirrors frozen main's `leftSidePaneShiftsMap` setting. Enabled by default: opening, closing,
  // or resizing the leading pane shifts the map by the pane's true-width delta. Disable it to
  // leave the canvas camera unchanged beneath the overlay pane.
  leadingPaneShiftsCanvas?: boolean;
  // Omit for frozen main's captured categories. A supplied palette replaces the complete editor
  // choice set; category persistence and editing remain host-owned.
  sectionTagColorPalette?: WorkspaceSectionTagColorPalette;
  ariaLabel?: string;
  className?: string;
};
