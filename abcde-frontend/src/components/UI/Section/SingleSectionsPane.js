import { Heading, Stack } from "@chakra-ui/react";
import React from "react";

import SectionContainer from "./SectionContainer/SectionContainer";

function SingleSectionsPane({ sectionIds, idx }) {
  return (
    <>
      <Stack>
        <Heading size="md" color="gray.300">
          Group {idx}
        </Heading>
        {sectionIds.map((e, idx) => (
          <SectionContainer
            sectionId={e}
            parentId={null}
            key={`${e}-${idx}`}
            depth={0}
          />
        ))}
      </Stack>
    </>
  );
}

export default React.memo(SingleSectionsPane);
