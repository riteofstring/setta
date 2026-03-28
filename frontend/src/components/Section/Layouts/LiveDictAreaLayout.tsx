import { ParamDndContext } from "forks/dnd-kit/ParamDndContext";
import React from "react";
import {
  GroupContainerShell,
  type GroupContainerShellProps,
} from "../../Params/groupContainerShell";
import { KwargsControls } from "../SectionParts/KwargsControls";
import type { LiveDictAreaLayoutView } from "./dictAreaView";

export type LiveDictAreaLayoutProps = Pick<
  LiveDictAreaLayoutView,
  "kwargsControlsProps"
> & {
  groupContainerShellProps: GroupContainerShellProps;
};

function _LiveDictAreaLayout({
  groupContainerShellProps,
  kwargsControlsProps,
}: LiveDictAreaLayoutProps) {
  return (
    <>
      <KwargsControls {...kwargsControlsProps} />
      <ParamDndContext>
        <GroupContainerShell {...groupContainerShellProps} />
      </ParamDndContext>
    </>
  );
}

export const LiveDictAreaLayout = React.memo(_LiveDictAreaLayout);
