import React from "react";
import { useStoreState } from "easy-peasy";

import { getBreadCrumbPath } from "../../../../../../utils/sectionIds";

import TheBreadCrumb from "./TheBreadcrumb/TheBreadCrumb";

const Breadcrumbs = ({ rootId }) => {
  const idHierarchy = useStoreState((state) => state.master.idHierarchy);
  const rootIdHierarchy = useStoreState(
    (state) => state.master.rootIdHierarchy
  );

  const isVisible = useStoreState((state) => state.master.isVisible);
  const sectionIdsToSectionNames = useStoreState(
    (state) => state.master.sectionIdsToSectionNames
  );
  const { breadCrumbPath, idLineage } = getBreadCrumbPath(
    rootId,
    idHierarchy,
    rootIdHierarchy,
    isVisible,
    sectionIdsToSectionNames
  );

  return (
    <TheBreadCrumb breadCrumbPath={breadCrumbPath} idLineage={idLineage} />
  );
};

export default React.memo(Breadcrumbs);
