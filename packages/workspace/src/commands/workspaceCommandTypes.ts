import type { ComponentType } from "react";
import type {
  Position,
  WorkspaceItem,
  WorkspaceSection,
} from "../document/types";
import type { WorkspaceSnapshot } from "../document/workspaceSnapshot";
import type { WorkspaceHost } from "../workspaceHost";

export type WorkspaceCommandIconProps = {
  className?: string;
};

export type WorkspaceCommandSurface =
  | "context-menu"
  | "header"
  | "inspector"
  | "inspector-parameters"
  | "outline"
  | "toolbar";

export type WorkspacePaneCommandContext = Readonly<{
  host: WorkspaceHost;
  scope: "pane";

  workspacePosition: Readonly<Position> | null;
}>;

export type WorkspaceSectionCommandContext = Readonly<{
  host: WorkspaceHost;
  scope: "section";
  section: WorkspaceSnapshot<WorkspaceSection>;
  selectedSections: ReadonlyArray<WorkspaceSnapshot<WorkspaceSection>>;
}>;

export type WorkspaceItemCommandContext = Readonly<{
  host: WorkspaceHost;
  scope: "item";
  section: WorkspaceSnapshot<WorkspaceSection>;
  item: WorkspaceSnapshot<WorkspaceItem>;
}>;

export type WorkspaceCommandContext =
  | WorkspacePaneCommandContext
  | WorkspaceSectionCommandContext
  | WorkspaceItemCommandContext;

export type WorkspaceCommandScope = WorkspaceCommandContext["scope"];

type WorkspaceCommandDefinitionFor<
  Scope extends WorkspaceCommandScope,
  Context extends WorkspaceCommandContext,
> = {
  id: string;
  scope: Scope;
  surfaces: ReadonlyArray<WorkspaceCommandSurface>;
  label: string;
  icon?: ComponentType<WorkspaceCommandIconProps>;

  getDisabledReason?: (context: Context) => string | null;

  getStatusMessage?: (context: Context) => string;

  isChecked?: (context: Context) => boolean;
  run: (context: Context) => void;
};

export type WorkspaceCommandDefinition =
  | WorkspaceCommandDefinitionFor<"pane", WorkspacePaneCommandContext>
  | WorkspaceCommandDefinitionFor<"section", WorkspaceSectionCommandContext>
  | WorkspaceCommandDefinitionFor<"item", WorkspaceItemCommandContext>;

type WorkspacePackageCommandFor<
  Scope extends WorkspaceCommandScope,
  Context extends WorkspaceCommandContext,
> = WorkspaceCommandDefinitionFor<Scope, Context> & {
  isApplicable?: (context: Context) => boolean;

  tone?: "danger";
};

export type WorkspacePackageCommandDefinition =
  | WorkspacePackageCommandFor<"pane", WorkspacePaneCommandContext>
  | WorkspacePackageCommandFor<"section", WorkspaceSectionCommandContext>
  | WorkspacePackageCommandFor<"item", WorkspaceItemCommandContext>;
