import React from "react";
import { DictAreaLiveBoundary } from "./DictAreaLiveBoundary";

type DictAreaProps = {
  sectionId: string;
  bgColor: string;
};

function _DictArea({ sectionId, bgColor }: DictAreaProps) {
  return <DictAreaLiveBoundary sectionId={sectionId} bgColor={bgColor} />;
}

export const DictArea = React.memo(_DictArea);
