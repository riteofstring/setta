import React from "react";
import { LiveDictAreaLayout } from "./LiveDictAreaLayout";

type DictAreaProps = {
  sectionId: string;
  bgColor: string;
};

function _DictArea({ sectionId, bgColor }: DictAreaProps) {
  return <LiveDictAreaLayout sectionId={sectionId} bgColor={bgColor} />;
}

export const DictArea = React.memo(_DictArea);
