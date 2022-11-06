import { Deck } from "./Deck";
import { SectionWithoutChildren } from "./SectionWithoutChildren";

export function DeckOrSection({
  isDeck,
  sectionId,
  parentId,
  nextId,
  hasNested,
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
  return (
    <SectionWithoutChildren
      sectionId={sectionId}
      parentId={parentId}
      nextId={nextId}
      hasNested={hasNested}
      dragDropProps={dragDropProps}
      contextStyle={contextStyle}
      sectionStyle={sectionStyle}
      insertionLineStyle={insertionLineStyle}
    >
      {children}
    </SectionWithoutChildren>
  );
}
