import { NestedSection } from "./NestedSection";
import { TopLevelSection } from "./TopLevelSection";

export function TopLevelOrNested({
  isDeck,
  sectionId,
  parentId,
  nextId,
  hasNested,
  depth,
  children,
}) {
  if (depth === 0) {
    return (
      <TopLevelSection
        isDeck={isDeck}
        sectionId={sectionId}
        parentId={parentId}
        nextId={nextId}
        hasNested={hasNested}
      >
        {children}
      </TopLevelSection>
    );
  }
  return (
    <NestedSection
      isDeck={isDeck}
      sectionId={sectionId}
      parentId={parentId}
      nextId={nextId}
      hasNested={hasNested}
    >
      {children}
    </NestedSection>
  );
}
