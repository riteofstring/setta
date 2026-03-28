import React from "react";
import {
  useGroupContainerShellBoundary,
  type GroupContainerShellBoundary,
  type GroupContainerShellBoundaryInput,
} from "./groupContainerShellBoundary";
import {
  GroupContainerWrapper,
  type GroupContainerWrapperProps,
} from "./groupContainerWrapper";

function buildGroupContainerWrapperProps({
  liveDictAreaMountProps,
  setOuterRef,
  waitingForResult,
}: GroupContainerShellBoundary): GroupContainerWrapperProps {
  return {
    liveDictAreaMountProps,
    setOuterRef,
    waitingForResult,
  };
}

function _ParamGroupContainer(props: GroupContainerShellBoundaryInput) {
  const groupContainerShellBoundary = useGroupContainerShellBoundary(props);

  return (
    <GroupContainerWrapper
      {...buildGroupContainerWrapperProps(groupContainerShellBoundary)}
    />
  );
}

export const ParamGroupContainer = React.memo(_ParamGroupContainer);
