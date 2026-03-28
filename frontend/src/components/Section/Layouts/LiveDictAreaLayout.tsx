import React from "react";
import {
  GroupContainerWrapper,
  type GroupContainerWrapperProps,
} from "../../Params/groupContainerWrapper";
import {
  useGroupContainerShellBoundary,
  type GroupContainerShellBoundary,
} from "../../Params/groupContainerShellBoundary";
import { KwargsControls } from "../SectionParts/KwargsControls";
import type { LiveDictAreaLayoutView } from "./dictAreaView";

export type LiveDictAreaLayoutProps = LiveDictAreaLayoutView;

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

function _LiveDictAreaLayout({
  kwargsControlsProps,
  paramGroupContainerProps,
}: LiveDictAreaLayoutProps) {
  const groupContainerShellBoundary = useGroupContainerShellBoundary(
    paramGroupContainerProps,
  );

  return (
    <>
      <KwargsControls {...kwargsControlsProps} />
      <GroupContainerWrapper
        {...buildGroupContainerWrapperProps(groupContainerShellBoundary)}
      />
    </>
  );
}

export const LiveDictAreaLayout = React.memo(_LiveDictAreaLayout);
