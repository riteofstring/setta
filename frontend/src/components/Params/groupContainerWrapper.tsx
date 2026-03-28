import { ParamDndContext } from "forks/dnd-kit/ParamDndContext";
import {
  GroupContainerShell,
  type GroupContainerShellProps,
} from "./groupContainerShell";
import {
  useGroupContainerShellBoundary,
  type GroupContainerShellBoundaryInput,
} from "./groupContainerShellBoundary";

export type GroupContainerWrapperProps = GroupContainerShellBoundaryInput;

function buildGroupContainerShellProps({
  liveDictAreaMountProps,
  setOuterRef,
  waitingForResult,
}: ReturnType<typeof useGroupContainerShellBoundary>): GroupContainerShellProps {
  return {
    liveDictAreaMountProps,
    setOuterRef,
    waitingForResult,
  };
}

export function GroupContainerWrapper({
  bgColor,
  sectionId,
  sectionTypeName,
}: GroupContainerWrapperProps) {
  const groupContainerShellBoundary = useGroupContainerShellBoundary({
    bgColor,
    sectionId,
    sectionTypeName,
  });

  return (
    <ParamDndContext>
      <GroupContainerShell
        {...buildGroupContainerShellProps(groupContainerShellBoundary)}
      />
    </ParamDndContext>
  );
}
