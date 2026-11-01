import type { ComponentType, ReactNode, RefObject } from "react";
import type { WorkspaceCanvasConfiguration } from "../canvas/configuration.js";
import type { WorkspaceNavigatorConfiguration } from "../navigator/workspaceNavigatorTypes.js";
import type { WorkspaceSectionTagColorPalette } from "../section/sectionTagColors.js";
import type { WorkspaceShellWindowingConfiguration } from "../windowing/workspaceWindowingContext.js";

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

  disabled?: boolean;

  initialFocusRef?: RefObject<HTMLElement | null>;
};

export type WorkspaceShellProps = {
  viewState: WorkspaceShellViewState;
  onViewStateChange: (nextState: WorkspaceShellViewState) => void;

  canvas?: WorkspaceCanvasConfiguration;

  leadingTabs: ReadonlyArray<WorkspaceShellTabDefinition>;
  trailingTabs: ReadonlyArray<WorkspaceShellTabDefinition>;

  includeBuiltInInspector?: boolean;

  includeBuiltInSavedViews?: boolean;

  includeSavedViewTabs?: boolean;

  navigator?: WorkspaceNavigatorConfiguration;

  windowManager?: ReactNode;

  windowing?: WorkspaceShellWindowingConfiguration;

  leadingPaneShiftsCanvas?: boolean;

  sectionTagColorPalette?: WorkspaceSectionTagColorPalette;
  ariaLabel?: string;
  className?: string;
};
