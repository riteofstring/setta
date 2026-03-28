import { ParamDndContext } from "forks/dnd-kit/ParamDndContext";
import {
  GroupContainerShell,
  type GroupContainerShellProps,
} from "./groupContainerShell";
import {
  useGroupContainerShellBoundary,
  type GroupContainerShellBoundary,
  type GroupContainerShellBoundaryInput,
} from "./groupContainerShellBoundary";

export type GroupContainerWrapperProps = GroupContainerShellBoundaryInput;

function buildGroupContainerShellProps({
  liveDictAreaMountProps,
  setOuterRef,
  waitingForResult,
}: GroupContainerShellBoundary): GroupContainerShellProps {
  return {
    liveDictAreaMountProps,
    setOuterRef,
    waitingForResult,
  };
}

export function GroupContainerWrapper(props: GroupContainerWrapperProps) {
  const groupContainerShellBoundary = useGroupContainerShellBoundary(props);

  return (
    <ParamDndContext>
      <GroupContainerShell
        {...buildGroupContainerShellProps(groupContainerShellBoundary)}
      />
    </ParamDndContext>
  );
}
