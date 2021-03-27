import React from "react";
import { useStoreState } from "easy-peasy";
import { SectionContainer } from "./SectionContainer/SectionContainer";
import { getRootIds } from "../../../utils/sectionIds";
import { arraysAreEqual } from "../../../utils/commonFunctions";

const SectionsPane = () => {
  const rootSectionsHaveChanged = (prev, next) => {
    const prevIds = prev ? getRootIds(prev) : [];
    const nextIds = next ? getRootIds(next) : [];
    return arraysAreEqual(prevIds, nextIds);
  };

  const currPage = useStoreState((state) => state.master.currPage);
  const idHierarchy = useStoreState(
    (state) => state.master.idHierarchy[currPage],
    rootSectionsHaveChanged
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
          key={`${e}-${idx}`}
          depth={0}
        />
      ))}
    </>
  );
};

export default React.memo(SectionsPane);
