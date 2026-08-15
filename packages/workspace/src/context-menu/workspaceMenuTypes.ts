import type { ComponentType } from "react";
import type {
  Position,
  WorkspaceItem,
  WorkspaceSection,
  WorkspaceSectionInput,
} from "../document/types";

export type WorkspaceMenuIconProps = {
  className?: string;
};

type WorkspaceMenuSnapshot<Value> = Value extends (...args: Array<never>) => unknown
  ? Value
  : Value extends ReadonlyArray<infer Entry>
    ? ReadonlyArray<WorkspaceMenuSnapshot<Entry>>
    : Value extends object
      ? { readonly [Key in keyof Value]: WorkspaceMenuSnapshot<Value[Key]> }
      : Value;

export type WorkspaceCreationContext = Readonly<{
  workspacePosition: Readonly<Position>;
}>;

export type WorkspacePaneMenuActionContext = Readonly<{
  scope: "pane";
  workspacePosition: Readonly<Position>;
}>;

export type WorkspaceSectionMenuActionContext = Readonly<{
  scope: "section";
  section: WorkspaceMenuSnapshot<WorkspaceSection>;
  selectedSections: ReadonlyArray<WorkspaceMenuSnapshot<WorkspaceSection>>;
}>;

export type WorkspaceItemMenuActionContext = Readonly<{
  scope: "item";
  section: WorkspaceMenuSnapshot<WorkspaceSection>;
  item: WorkspaceMenuSnapshot<WorkspaceItem>;
}>;

export type WorkspaceOutlineMenuActionContext = Readonly<{
  scope: "outline";
  section: WorkspaceMenuSnapshot<WorkspaceSection>;
  selectedSections: ReadonlyArray<WorkspaceMenuSnapshot<WorkspaceSection>>;
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
