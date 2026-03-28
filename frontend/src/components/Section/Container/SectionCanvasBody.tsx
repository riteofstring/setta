import React from "react";
import { getExternalProjectChatWindowBindingForSectionInState } from "state/actions/projectChatWindowing";
import { useProjectState } from "state/definitions";
import { SectionTypeEnum } from "utils/generatedTypes";
import { SectionCanvasArea } from "./SectionCanvasArea";
import { SectionWindowPlaceholder } from "./SectionWindowPlaceholder";
import {
  buildSectionCanvasBodyView,
  type SectionCanvasBodyProps,
} from "./sectionCanvasBodyView";

function _SectionCanvasBody(props: SectionCanvasBodyProps) {
  const externalizedWindowId = useProjectState((state) => {
    if (props.sectionTypeName === SectionTypeEnum.Chat) {
      return null;
    }

    return (
      getExternalProjectChatWindowBindingForSectionInState(
        state.projectChatWindowing,
        props.sectionId,
      )?.instanceId ?? null
    );
  });
  const view = buildSectionCanvasBodyView({ ...props, externalizedWindowId });

  switch (view.kind) {
    case "placeholder":
      return <SectionWindowPlaceholder {...view.props} />;
    case "area":
      return <SectionCanvasArea {...view.props} />;
    case "none":
      return null;
    default:
      return view satisfies never;
  }
}

export const SectionCanvasBody = React.memo(_SectionCanvasBody);
