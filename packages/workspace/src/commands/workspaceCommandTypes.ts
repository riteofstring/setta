import type { ComponentType } from "react";
import type { Position, WorkspaceItem, WorkspaceSection } from "../document/types";
import type { WorkspaceSnapshot } from "../document/workspaceSnapshot";

export type WorkspaceCommandIconProps = {
  className?: string;
};

// Scope decides what a command receives; surface decides where the package offers it. A command
// runs the same way on every surface that lists it, so moving an action between surfaces never
// changes what it does. The two Inspector surfaces are separate placements of the same pane: the
// section action row and the parameter action row. The toolbar surface is the viewport toolbar,
// where a host places a command through a toolbar contribution.
export type WorkspaceCommandSurface =
  "context-menu" | "header" | "inspector" | "inspector-parameters" | "outline" | "toolbar";

export type WorkspacePaneCommandContext = Readonly<{
  scope: "pane";
  // Where on the canvas the command was asked for, and null when the request carried no pointer.
  // A pane menu opens at a point; a toolbar control acts on the workspace from a fixed place that
  // means nothing in canvas coordinates, so it reports no position rather than inventing one.
  workspacePosition: Readonly<Position> | null;
}>;

export type WorkspaceSectionCommandContext = Readonly<{
  scope: "section";
  section: WorkspaceSnapshot<WorkspaceSection>;
  selectedSections: ReadonlyArray<WorkspaceSnapshot<WorkspaceSection>>;
}>;

export type WorkspaceItemCommandContext = Readonly<{
  scope: "item";
  section: WorkspaceSnapshot<WorkspaceSection>;
  item: WorkspaceSnapshot<WorkspaceItem>;
}>;

export type WorkspaceCommandContext =
  WorkspacePaneCommandContext | WorkspaceSectionCommandContext | WorkspaceItemCommandContext;

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
  // A command that returns a reason is offered but refuses to run, and every surface shows the
  // same explanation. Returning null keeps it enabled.
  getDisabledReason?: (context: Context) => string | null;
  // Surfaces with a live region announce this after a successful run.
  getStatusMessage?: (context: Context) => string;
  // A command that answers here is a toggle: menus check it and the toolbar presses it. It is
  // read while a surface paints an entry it has already decided to offer.
  isChecked?: (context: Context) => boolean;
  run: (context: Context) => void;
};

export type WorkspaceCommandDefinition =
  | WorkspaceCommandDefinitionFor<"pane", WorkspacePaneCommandContext>
  | WorkspaceCommandDefinitionFor<"section", WorkspaceSectionCommandContext>
  | WorkspaceCommandDefinitionFor<"item", WorkspaceItemCommandContext>;

// Package commands additionally decide whether they belong in a surface at all. Host commands are
// always offered on the surfaces they declare and explain themselves through getDisabledReason, so
// applicability never runs host code on a surface that has not been opened — and a contributed
// toolbar control keeps its place in the column instead of appearing and vanishing.
type WorkspacePackageCommandFor<
  Scope extends WorkspaceCommandScope,
  Context extends WorkspaceCommandContext,
> = WorkspaceCommandDefinitionFor<Scope, Context> & {
  isApplicable?: (context: Context) => boolean;
  // Surfaces that distinguish destructive actions, such as the Inspector's action rows, paint the
  // command from this tone instead of matching its id.
  tone?: "danger";
};

export type WorkspacePackageCommandDefinition =
  | WorkspacePackageCommandFor<"pane", WorkspacePaneCommandContext>
  | WorkspacePackageCommandFor<"section", WorkspaceSectionCommandContext>
  | WorkspacePackageCommandFor<"item", WorkspaceItemCommandContext>;
