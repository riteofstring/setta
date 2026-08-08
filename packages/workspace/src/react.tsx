import type { HTMLAttributes } from "react";

import {
  WORKSPACE_NO_PAN_CLASS_NAME,
  WORKSPACE_NO_WHEEL_CLASS_NAME,
} from "./internal/workspace-interaction-boundary.js";

export type {
  WorkspaceBooleanPreferenceChangeHandler,
  WorkspaceDocumentChangeHandler,
  WorkspaceMarqueeSelectionMode,
  WorkspaceMinimapOptions,
  WorkspaceMinimapPlacement,
  WorkspaceOverlayPlacement,
  WorkspaceOverlayRenderer,
  WorkspaceOverlaySlots,
  WorkspaceProps,
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
  WorkspaceSectionColorOption,
  WorkspaceSectionFactory,
  WorkspaceSectionFactoryRequest,
  WorkspaceSectionFactoryResult,
  WorkspaceSectionTitleValidationRequest,
  WorkspaceSectionTitleValidator,
} from "./internal/workspace-section-contract.js";

export type WorkspaceInteractionBoundaryProps = HTMLAttributes<HTMLDivElement> &
  Readonly<{
    preventPan?: boolean;
    preventWheel?: boolean;
  }>;

export function WorkspaceInteractionBoundary({
  className,
  preventPan = true,
  preventWheel = true,
  ...props
}: WorkspaceInteractionBoundaryProps) {
  if (typeof preventPan !== "boolean" || typeof preventWheel !== "boolean") {
    throw new TypeError("Workspace interaction boundary options must be boolean.");
  }
  const resolvedClassName = [
    "setta-workspace__interaction-boundary",
    preventPan ? WORKSPACE_NO_PAN_CLASS_NAME : null,
    preventWheel ? WORKSPACE_NO_WHEEL_CLASS_NAME : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div
      {...props}
      className={resolvedClassName}
      data-workspace-prevent-pan={preventPan ? "true" : undefined}
      data-workspace-prevent-wheel={preventWheel ? "true" : undefined}
    />
  );
}
