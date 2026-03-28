import React from "react";
import type { GroupContainerShellProps } from "../../Params/groupContainerShell";
import {
  useGroupContainerShellBoundary,
  type GroupContainerShellBoundary,
} from "../../Params/groupContainerShellBoundary";
import { LiveDictAreaLayout } from "./LiveDictAreaLayout";
import { buildLiveDictAreaLayoutView } from "./dictAreaView";
import {
  readLiveDictAreaRendererModeFromWindow,
  type LiveDictAreaRendererMode,
} from "./liveDictAreaRendererMode";

export type DictAreaLiveBoundaryProps = {
  bgColor: string;
  sectionId: string;
};

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

function _DictAreaLiveBoundary({
  bgColor,
  sectionId,
}: DictAreaLiveBoundaryProps) {
  const renderMode = readLiveDictAreaRendererModeFromWindow();
  const liveDictAreaLayoutView = buildLiveDictAreaLayoutView({
    bgColor,
    sectionId,
  });
  const groupContainerShellBoundary = useGroupContainerShellBoundary({
    ...liveDictAreaLayoutView.paramGroupContainerProps,
    renderMode,
  });

  return (
    <LiveDictAreaLayout
      groupContainerShellProps={buildGroupContainerShellProps({
        ...groupContainerShellBoundary,
        renderMode,
      })}
      kwargsControlsProps={liveDictAreaLayoutView.kwargsControlsProps}
    />
  );
}

export const DictAreaLiveBoundary = React.memo(_DictAreaLiveBoundary);
