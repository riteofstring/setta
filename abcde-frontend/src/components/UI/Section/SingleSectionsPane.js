import { Heading, Stack } from "@chakra-ui/react";
import React from "react";

import SectionContainer from "./SectionContainer/SectionContainer";

function SingleSectionsPane({ groupId, sectionIds }) {
  return (
    <>
      <div>
        <Heading size="md" color="gray.300">
          Group {groupId}
        </Heading>
        {sectionIds.map((e, idx) => (
          <SectionContainer
            sectionId={e}
            parentId={null}
            key={`${e}-${idx}`}
            depth={0}
          />
        ))}
      </div>
    </>
  );
}

export default React.memo(SingleSectionsPane);
