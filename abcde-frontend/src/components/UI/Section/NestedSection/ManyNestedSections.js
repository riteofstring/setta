import React from "react";
import { DNDSortable } from "utils/DNDSortable/DNDSortable";

import { NestedSection } from "./NestedSection";

export default function ManyNestedSections({
  childIds,
  sectionId,
  depth,
  setChildren,
  dummy,
}) {
  return (
    <DNDSortable items={childIds} setItems={setChildren}>
      {childIds.map((e, idx) => (
        <NestedSection
          parentId={sectionId}
          sectionId={e}
          nextId={childIds[idx + 1]}
          key={`Nested-Sec-${e}`}
          depth={depth + 1}
          dummy={dummy}
        />
      ))}
    </DNDSortable>
  );
}
