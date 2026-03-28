import { isTempSection } from "forks/dnd-kit/dndState";
import type { ReactElement } from "react";
import type { SectionContainerCoreBodyRenderer } from "./SectionContainer";
import type { SectionContainerNestedSectionsProps } from "./sectionContainerNestedSectionsView";

export type SortableSectionDragListeners = Record<string, unknown>;

export type SortableSectionNestedSectionsRenderer = (
  props: SectionContainerNestedSectionsProps,
) => ReactElement | null;

export type SortableSectionBodyProps = {
  sectionId: string;
  applyTransform: boolean;
  listeners: SortableSectionDragListeners;
  renderCoreBody: SectionContainerCoreBodyRenderer;
  renderNestedSections: SortableSectionNestedSectionsRenderer;
};

type SectionContainerViewProps = {
  sectionId: string;
  dragListeners: SortableSectionDragListeners;
};

export type SortableSectionBodyView =
  | { kind: "temp" }
  | { kind: "section"; props: SectionContainerViewProps }
  | { kind: "none" };

export function buildSortableSectionBodyView({
  sectionId,
  applyTransform,
  listeners,
}: SortableSectionBodyProps): SortableSectionBodyView {
  if (isTempSection(sectionId)) {
    return applyTransform ? { kind: "temp" } : { kind: "none" };
  }

  return {
    kind: "section",
    props: {
      sectionId,
      dragListeners: listeners,
    },
  };
}
