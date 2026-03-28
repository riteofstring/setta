import React from "react";
import { LiveDictAreaLayout } from "./LiveDictAreaLayout";
import { buildLiveDictAreaLayoutView } from "./dictAreaView";

export type DictAreaLiveBoundaryProps = {
  bgColor: string;
  sectionId: string;
};

function _DictAreaLiveBoundary({
  bgColor,
  sectionId,
}: DictAreaLiveBoundaryProps) {
  const liveDictAreaLayoutProps = buildLiveDictAreaLayoutView({
    bgColor,
    sectionId,
  });

  return <LiveDictAreaLayout {...liveDictAreaLayoutProps} />;
}

export const DictAreaLiveBoundary = React.memo(_DictAreaLiveBoundary);
