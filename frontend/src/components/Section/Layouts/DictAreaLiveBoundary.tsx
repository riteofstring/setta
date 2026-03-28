import React from "react";
import type { GroupContainerShellProps } from "../../Params/groupContainerShell";
import {
  useGroupContainerShellBoundary,
  type GroupContainerShellBoundary,
} from "../../Params/groupContainerShellBoundary";
import { LiveDictAreaLayout } from "./LiveDictAreaLayout";
import { buildLiveDictAreaLayoutView } from "./dictAreaView";

export type DictAreaLiveBoundaryProps = {
  bgColor: string;
  sectionId: string;
};

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
      groupContainerShellProps={buildGroupContainerShellProps(
        groupContainerShellBoundary,
      )}
      kwargsControlsProps={liveDictAreaLayoutView.kwargsControlsProps}
    />
  );
}

export const DictAreaLiveBoundary = React.memo(_DictAreaLiveBoundary);
