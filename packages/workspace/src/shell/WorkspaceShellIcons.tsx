import { BsCardChecklist } from "react-icons/bs";
import { TbLayoutDashboard } from "react-icons/tb";
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

export function WorkspaceSavedViewsIcon(props: WorkspaceShellTabIconProps) {
  return <TbLayoutDashboard {...props} />;
}
