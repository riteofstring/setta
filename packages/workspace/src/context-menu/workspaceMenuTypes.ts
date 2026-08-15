import type { ComponentType } from "react";
import type {
  Position,
  WorkspaceItem,
  WorkspaceSection,
  WorkspaceSectionInput,
} from "../document/types";
import type { WorkspaceSnapshot } from "../document/workspaceSnapshot";

export type WorkspaceMenuIconProps = {
  className?: string;
};

export type WorkspaceCreationContext = Readonly<{
  workspacePosition: Readonly<Position>;
}>;

export type WorkspacePaneMenuActionContext = Readonly<{
  scope: "pane";
  workspacePosition: Readonly<Position>;
}>;

export type WorkspaceSectionMenuActionContext = Readonly<{
  scope: "section";
  section: WorkspaceSnapshot<WorkspaceSection>;
  selectedSections: ReadonlyArray<WorkspaceSnapshot<WorkspaceSection>>;
}>;

export type WorkspaceItemMenuActionContext = Readonly<{
  scope: "item";
  section: WorkspaceSnapshot<WorkspaceSection>;
  item: WorkspaceSnapshot<WorkspaceItem>;
}>;

export type WorkspaceOutlineMenuActionContext = Readonly<{
  scope: "outline";
  section: WorkspaceSnapshot<WorkspaceSection>;
  selectedSections: ReadonlyArray<WorkspaceSnapshot<WorkspaceSection>>;
}>;

export type WorkspaceMenuActionContext =
  | WorkspacePaneMenuActionContext
  | WorkspaceSectionMenuActionContext
  | WorkspaceItemMenuActionContext
  | WorkspaceOutlineMenuActionContext;

type WorkspaceMenuActionDefinitionFor<
  Scope extends WorkspaceMenuActionContext["scope"],
  Context extends WorkspaceMenuActionContext,
> = {
  id: string;
  scope: Scope;
  label: string;
  icon?: ComponentType<WorkspaceMenuIconProps>;
  isDisabled?: (context: Context) => boolean;
  onSelect: (context: Context) => void;
};

export type WorkspaceMenuActionDefinition =
  | WorkspaceMenuActionDefinitionFor<"pane", WorkspacePaneMenuActionContext>
  | WorkspaceMenuActionDefinitionFor<"section", WorkspaceSectionMenuActionContext>
  | WorkspaceMenuActionDefinitionFor<"item", WorkspaceItemMenuActionContext>
  | WorkspaceMenuActionDefinitionFor<"outline", WorkspaceOutlineMenuActionContext>;

export type WorkspaceCreationCommand = {
  id: string;
  label: string;
  group: string;
  icon?: ComponentType<WorkspaceMenuIconProps>;
  isDisabled?: (context: WorkspaceCreationContext) => boolean;
  createSection: (context: WorkspaceCreationContext) => WorkspaceSectionInput;
};
