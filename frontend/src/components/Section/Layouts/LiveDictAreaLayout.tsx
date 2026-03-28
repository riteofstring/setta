import React from "react";
import { ParamGroupContainer } from "../../Params/GroupContainer";
import { KwargsControls } from "../SectionParts/KwargsControls";
import { buildLiveDictAreaLayoutView } from "./dictAreaView";

export type LiveDictAreaLayoutProps = {
  bgColor: string;
  sectionId: string;
};

function _LiveDictAreaLayout({
  bgColor,
  sectionId,
}: LiveDictAreaLayoutProps) {
  const { kwargsControlsProps, paramGroupContainerProps } =
    buildLiveDictAreaLayoutView({
      bgColor,
      sectionId,
    });

  return (
    <>
      <KwargsControls {...kwargsControlsProps} />
      <ParamGroupContainer {...paramGroupContainerProps} />
    </>
  );
}

export const LiveDictAreaLayout = React.memo(_LiveDictAreaLayout);
