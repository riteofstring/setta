import { ParamDndContext } from "forks/dnd-kit/ParamDndContext";
import {
  GroupContainerShell,
  type GroupContainerShellProps,
} from "./groupContainerShell";
export type GroupContainerWrapperProps = GroupContainerShellProps;

export function GroupContainerWrapper(props: GroupContainerWrapperProps) {
  return (
    <ParamDndContext>
      <GroupContainerShell {...props} />
    </ParamDndContext>
  );
}
