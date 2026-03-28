import React from "react";
import { ParamGroupContainer } from "../../Params/GroupContainer";
import { KwargsControls } from "../SectionParts/KwargsControls";
import type { LiveDictAreaLayoutView } from "./dictAreaView";

export type LiveDictAreaLayoutProps = LiveDictAreaLayoutView;

function _LiveDictAreaLayout({
  kwargsControlsProps,
  paramGroupContainerProps,
}: LiveDictAreaLayoutProps) {
  return (
    <>
      <KwargsControls {...kwargsControlsProps} />
      <ParamGroupContainer {...paramGroupContainerProps} />
    </>
  );
}

export const LiveDictAreaLayout = React.memo(_LiveDictAreaLayout);
