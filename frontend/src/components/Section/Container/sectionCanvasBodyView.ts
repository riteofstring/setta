import type { SectionType } from "utils/generatedTypes";
import type { SectionContainerAreaProps } from "./sectionContainerAreaView";

export type SectionCanvasBodyProps = {
  sectionId: string;
  sectionTypeName: SectionType;
  bgColor: string;
  isMinimized: boolean;
  isUserView: boolean;
};

type SectionCanvasBodyViewInput = SectionCanvasBodyProps & {
  externalizedWindowId: string | null;
};

type SectionWindowPlaceholderProps = {
  instanceId: string;
  sectionId: string;
  dataTestId: "section-canvas-window-placeholder";
};

export type SectionCanvasBodyView =
  | { kind: "placeholder"; props: SectionWindowPlaceholderProps }
  | { kind: "area"; props: SectionContainerAreaProps }
  | { kind: "none" };

export function buildSectionCanvasBodyView({
  sectionId,
  sectionTypeName,
  bgColor,
  isMinimized,
  isUserView,
  externalizedWindowId,
}: SectionCanvasBodyViewInput): SectionCanvasBodyView {
  if (externalizedWindowId) {
    return {
      kind: "placeholder",
      props: {
        instanceId: externalizedWindowId,
        sectionId,
        dataTestId: "section-canvas-window-placeholder",
      },
    };
  }

  if (isMinimized) {
    return { kind: "none" };
  }

  return {
    kind: "area",
    props: {
      sectionId,
      sectionTypeName,
      bgColor,
      isMinimized,
      isUserView,
      chatHost: "section_layout",
    },
  };
}
