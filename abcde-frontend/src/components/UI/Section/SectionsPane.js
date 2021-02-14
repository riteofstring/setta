import React from "react";
import { Flex } from "@chakra-ui/react";
import { useStoreState } from "easy-peasy";

import SectionContainer from "./SectionContainer/SectionContainer";

const SectionsPane = () => {
  const sections = useStoreState((state) => state.master.sections);
  const rootIdHierarchy = useStoreState(
    (state) => state.master.rootIdHierarchy
  );

  const idKeys = Object.keys(rootIdHierarchy);

  return (
    <>
      {idKeys.map((e, idx) => (
        <SectionContainer
          sectionId={e}
          rootId={e}
          parentId={null}
          nextId={idKeys[idx + 1]}
          childrenIds={rootIdHierarchy[e].children}
          theSection={sections[e]}
          key={`${e}-${idx}`}
          depth={0}
        />
      ))}
    </>
  );
};

export default React.memo(SectionsPane);
