import React from "react";
import {
  useGroupContainerShellBoundary,
  type GroupContainerShellBoundary,
} from "../../Params/groupContainerShellBoundary";
import type { GroupContainerWrapperProps } from "../../Params/groupContainerWrapper";
import { LiveDictAreaLayout } from "./LiveDictAreaLayout";
import { buildLiveDictAreaLayoutView } from "./dictAreaView";

export type DictAreaLiveBoundaryProps = {
  bgColor: string;
  sectionId: string;
};

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

function _DictAreaLiveBoundary({
  bgColor,
  sectionId,
}: DictAreaLiveBoundaryProps) {
  const liveDictAreaLayoutView = buildLiveDictAreaLayoutView({
    bgColor,
    sectionId,
  });
  const groupContainerShellBoundary = useGroupContainerShellBoundary(
    liveDictAreaLayoutView.paramGroupContainerProps,
  );

  return (
    <LiveDictAreaLayout
      groupContainerWrapperProps={buildGroupContainerWrapperProps(
        groupContainerShellBoundary,
      )}
      kwargsControlsProps={liveDictAreaLayoutView.kwargsControlsProps}
    />
  );
}

export const DictAreaLiveBoundary = React.memo(_DictAreaLiveBoundary);
