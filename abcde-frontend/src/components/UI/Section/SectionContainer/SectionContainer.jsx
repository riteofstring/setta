import "@chakra-ui/react";
import { Box } from "@chakra-ui/react";
import { useIdsOverview } from "hooks/useIdsOverview";
import { useGetSectionType } from "hooks/useSectionType";
import React from "react";
import { DECK } from "utils/constants";
import ManyNestedSections from "../NestedSection/ManyNestedSections";
import { TopLevelOrNested } from "./Wrappers/TopLevelOrNested";

function SectionContainer({ sectionId, parentId, nextId, depth }) {
  const isDeck = useGetSectionType(sectionId).type === DECK;
  const idsOverview = useIdsOverview(sectionId);
  const hasNested = idsOverview.length > 0;

  return (
    <TopLevelOrNested
      isDeck={isDeck}
      sectionId={sectionId}
      parentId={parentId}
      nextId={nextId}
      hasNested={hasNested}
      depth={depth}
    >
      {hasNested && (
        <Box flexDirection="column" display="flex">
          <ManyNestedSections
            childIds={idsOverview}
            sectionId={sectionId}
            depth={depth}
            isDeck={isDeck}
          />
        </Box>
      )}
    </TopLevelOrNested>
  );
}
export default React.memo(SectionContainer, (p, n) => {
  return p.nextId === n.nextId;
});

// // A section that has nested needs to be a droppable itself
// // Decks are excluded
// function HasNested({ children, ...props }) {
//   const { setNodeRef: droppableRef } = useDroppable({ id: sectionId });

//   return (
//     <Grid gap={2}>
//       <Stack {...contextStyle} {...sectionStyle} {...dragDropProps}>
//         <Box ref={droppableRef}>
//           <SectionContainerCore
//             sectionId={sectionId}
//             parentId={parentId}
//             nextId={nextId}
//             hasNested={hasNested}
//           />
//         </Box>
//         <div style={insertionLineStyle} />
//         {children}
//       </Stack>
//       <div style={insertionLineStyle} />
//     </Grid>
//   );
// }
