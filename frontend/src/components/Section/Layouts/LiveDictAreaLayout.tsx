import React from "react";
import {
  GroupContainerWrapper,
  type GroupContainerWrapperProps,
} from "../../Params/groupContainerWrapper";
import { KwargsControls } from "../SectionParts/KwargsControls";
import type { LiveDictAreaLayoutView } from "./dictAreaView";

export type LiveDictAreaLayoutProps = Pick<
  LiveDictAreaLayoutView,
  "kwargsControlsProps"
> & {
  groupContainerWrapperProps: GroupContainerWrapperProps;
};

function _LiveDictAreaLayout({
  groupContainerWrapperProps,
  kwargsControlsProps,
}: LiveDictAreaLayoutProps) {
  return (
    <>
      <KwargsControls {...kwargsControlsProps} />
      <GroupContainerWrapper {...groupContainerWrapperProps} />
    </>
  );
}

export const LiveDictAreaLayout = React.memo(_LiveDictAreaLayout);
