import { BsCardChecklist } from "react-icons/bs";
import { MdOutlineSettingsApplications } from "react-icons/md";
import type { WorkspaceShellTabIconProps } from "./workspaceShellTypes";

// Hosts can use the same two main-derived rail glyphs without taking a direct dependency on the
// package's icon library or recreating visual equivalents.
export function WorkspaceSectionSettingsIcon(
  props: WorkspaceShellTabIconProps,
) {
  return <MdOutlineSettingsApplications {...props} />;
}

export function WorkspaceParameterConfigurationIcon(
  props: WorkspaceShellTabIconProps,
) {
  return <BsCardChecklist {...props} />;
}
