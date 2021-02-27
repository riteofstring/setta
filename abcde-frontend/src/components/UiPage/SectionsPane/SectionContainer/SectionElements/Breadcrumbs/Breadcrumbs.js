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
  const sectionIdsToSectionHeadings = useStoreState(
    (state) => state.master.sectionIdsToSectionHeadings
  );
  const { breadCrumbPath, idLineage } = getBreadCrumbPath(
    rootId,
    idHierarchy,
    rootIdHierarchy,
    isVisible,
    sectionIdsToSectionHeadings
  );

  return (
    <TheBreadCrumb breadCrumbPath={breadCrumbPath} idLineage={idLineage} />
  );
};

export default React.memo(Breadcrumbs);
