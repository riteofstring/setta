import React from "react";
import {
  DictArea,
  type DictAreaProps,
} from "../Layouts/DictArea";

export type SectionContainerDictAreaProps = DictAreaProps;

function _SectionContainerDictArea(props: SectionContainerDictAreaProps) {
  return <DictArea {...props} />;
}

export const SectionContainerDictArea = React.memo(_SectionContainerDictArea);
