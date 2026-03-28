import { ParamDndContext } from "forks/dnd-kit/ParamDndContext";
import {
  readLiveDictAreaRendererModeFromWindow,
  type LiveDictAreaRendererMode,
} from "../Section/Layouts/liveDictAreaRendererMode";
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
  liveDictAreaSceneBoundary,
  renderMode,
  setOuterRef,
  waitingForResult,
}: GroupContainerShellBoundary & {
  renderMode: LiveDictAreaRendererMode;
}): GroupContainerShellProps {
  return {
    liveDictAreaMountProps,
    liveDictAreaSceneBoundary,
    renderMode,
    setOuterRef,
    waitingForResult,
  };
}

export function GroupContainerWrapper(props: GroupContainerWrapperProps) {
  const renderMode = readLiveDictAreaRendererModeFromWindow();
  const groupContainerShellBoundary = useGroupContainerShellBoundary({
    ...props,
    renderMode,
  });

  return (
    <ParamDndContext>
      <GroupContainerShell
        {...buildGroupContainerShellProps({
          ...groupContainerShellBoundary,
          renderMode,
        })}
      />
    </ParamDndContext>
  );
}
