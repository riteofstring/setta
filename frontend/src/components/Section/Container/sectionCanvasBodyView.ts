import type { SectionCanvasAreaProps } from "./sectionCanvasAreaView";

export type SectionCanvasBodyProps = SectionCanvasAreaProps;

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
  | { kind: "area"; props: SectionCanvasAreaProps }
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
    },
  };
}
