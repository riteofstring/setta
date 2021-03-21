import React from "react";
import { useStoreState } from "easy-peasy";
import SectionContainer from "./SectionContainer/SectionContainer";
import { getRootIds } from "../../../utils/sectionIds";

const SectionsPane = () => {
  const sections = useStoreState((state) => state.master.sections);
  const currPage = useStoreState((state) => state.master.currPage);
  const idHierarchy = useStoreState(
    (state) => state.master.idHierarchy[currPage]
  );

  const idKeys = idHierarchy ? getRootIds(idHierarchy) : [];

  console.log("SectionsPane idKeys", idKeys);

  return (
    <>
      {idKeys.map((e, idx) => (
        <SectionContainer
          sectionId={e}
          rootId={e}
          parentId={null}
          nextId={idKeys[idx + 1]}
          childrenIds={idHierarchy[e].children}
          theSection={sections[e]}
          key={`${e}-${idx}`}
          depth={0}
        />
      ))}
    </>
  );
};

export default React.memo(SectionsPane);
