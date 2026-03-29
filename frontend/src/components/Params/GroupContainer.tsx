import React from "react";
import {
  GroupContainerWrapper,
  type GroupContainerWrapperProps,
} from "./groupContainerWrapper";

function _ParamGroupContainer(props: GroupContainerWrapperProps) {
  return <GroupContainerWrapper {...props} />;
}

export const ParamGroupContainer = React.memo(_ParamGroupContainer);
