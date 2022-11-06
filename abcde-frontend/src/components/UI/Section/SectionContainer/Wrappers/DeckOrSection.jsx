import { Deck } from "./Deck";
import { SectionWithChildren } from "./SectionWithChildren";
import { SectionWithoutChildren } from "./SectionWithoutChildren";

export function DeckOrSection({
  isDeck,
  sectionId,
  parentId,
  nextId,
  hasNested,
  highlightContext,
  contextStyle,
  sectionStyle,
  insertionLineStyle,
  dragDropProps,
  children,
}) {
  if (isDeck) {
    return (
      <Deck
        sectionStyle={sectionStyle}
        dragDropProps={dragDropProps}
        sectionId={sectionId}
      >
        {children}
      </Deck>
    );
  }
  if (hasNested) {
    return (
      <SectionWithChildren
        sectionId={sectionId}
        parentId={parentId}
        nextId={nextId}
        dragDropProps={dragDropProps}
        highlightContext={highlightContext}
        contextStyle={contextStyle}
        sectionStyle={sectionStyle}
        insertionLineStyle={insertionLineStyle}
      >
        {children}
      </SectionWithChildren>
    );
  }
  return (
    <SectionWithoutChildren
      sectionId={sectionId}
      parentId={parentId}
      nextId={nextId}
      dragDropProps={dragDropProps}
      contextStyle={contextStyle}
      sectionStyle={sectionStyle}
      insertionLineStyle={insertionLineStyle}
    >
      {children}
    </SectionWithoutChildren>
  );
}
