import type { HTMLAttributes } from "react";

import {
  WORKSPACE_NO_EXTERNAL_DROP_CLASS_NAME,
  WORKSPACE_NO_PAN_CLASS_NAME,
  WORKSPACE_NO_WHEEL_CLASS_NAME,
} from "./internal/workspace-interaction-boundary.js";

export type { SortableItemTreeProps } from "./internal/sortable-item-tree-react-contract.js";
export { SortableItemTree } from "./internal/sortable-item-tree.js";

export type {
  SectionMovePlan,
  WorkspaceBooleanPreferenceChangeHandler,
  WorkspaceDocumentChangeHandler,
  WorkspaceExternalDropCandidate,
  WorkspaceExternalDropDecision,
  WorkspaceExternalDropEventMetadata,
  WorkspaceExternalDropHandler,
  WorkspaceExternalDropRequest,
  WorkspaceExternalDropValidator,
  WorkspaceMarqueeSelectionMode,
  WorkspaceMinimapOptions,
  WorkspaceMinimapPlacement,
  WorkspaceOverlayPlacement,
  WorkspaceOverlayRenderer,
  WorkspaceOverlaySlots,
  WorkspaceProps,
  WorkspaceSectionMoveDecision,
  WorkspaceSectionMoveMode,
  WorkspaceSectionMoveValidationRequest,
  WorkspaceSectionMoveValidator,
  WorkspaceSelectionOptions,
  WorkspaceToolbarControl,
  WorkspaceToolbarControlPlacement,
} from "./internal/workspace-react-contract.js";
export { Workspace } from "./internal/workspace-root.js";
export { WORKSPACE_DEFAULT_SECTION_COLOR_PALETTE } from "./internal/workspace-section-contract.js";
export type {
  SectionContentSizing,
  SectionCreationMetadata,
  SectionDefaultSize,
  SectionDefaultSizeMode,
  SectionDefinition,
  SectionRenderProps,
  SectionResizeAxes,
  SectionResizeOptions,
  WorkspaceGroupFactory,
  WorkspaceGroupFactoryRequest,
  WorkspaceGroupFactoryResult,
  WorkspaceSectionColorOption,
  WorkspaceSectionFactory,
  WorkspaceSectionFactoryRequest,
  WorkspaceSectionFactoryResult,
  WorkspaceSectionTitleValidationRequest,
  WorkspaceSectionTitleValidator,
} from "./internal/workspace-section-contract.js";

export type WorkspaceInteractionBoundaryProps = HTMLAttributes<HTMLDivElement> &
  Readonly<{
    preventExternalDrop?: boolean;
    preventPan?: boolean;
    preventWheel?: boolean;
  }>;

function assertInteractionBoundaryOptions(...values: readonly unknown[]): void {
  if (!values.every((value) => typeof value === "boolean")) {
    throw new TypeError("Workspace interaction boundary options must be boolean.");
  }
}

function interactionBoundaryClassName(
  className: string | undefined,
  preventExternalDrop: boolean,
  preventPan: boolean,
  preventWheel: boolean,
): string {
  const conditionalClasses: readonly (readonly [boolean, string])[] = [
    [preventExternalDrop, WORKSPACE_NO_EXTERNAL_DROP_CLASS_NAME],
    [preventPan, WORKSPACE_NO_PAN_CLASS_NAME],
    [preventWheel, WORKSPACE_NO_WHEEL_CLASS_NAME],
  ];
  return [
    "setta-workspace__interaction-boundary",
    ...conditionalClasses.filter(([enabled]) => enabled).map(([, value]) => value),
    className,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

function enabledDataAttribute(enabled: boolean): "true" | undefined {
  return enabled ? "true" : undefined;
}

export function WorkspaceInteractionBoundary({
  className,
  preventExternalDrop = false,
  preventPan = true,
  preventWheel = true,
  ...props
}: WorkspaceInteractionBoundaryProps) {
  assertInteractionBoundaryOptions(preventExternalDrop, preventPan, preventWheel);
  const resolvedClassName = interactionBoundaryClassName(
    className,
    preventExternalDrop,
    preventPan,
    preventWheel,
  );
  return (
    <div
      {...props}
      className={resolvedClassName}
      data-workspace-prevent-external-drop={enabledDataAttribute(preventExternalDrop)}
      data-workspace-prevent-pan={enabledDataAttribute(preventPan)}
      data-workspace-prevent-wheel={enabledDataAttribute(preventWheel)}
    />
  );
}
