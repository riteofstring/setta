import { BsCardChecklist } from "react-icons/bs";
import { MdOutlineSettingsApplications } from "react-icons/md";
import type { WorkspaceShellTabIconProps } from "./workspaceShellTypes";

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
