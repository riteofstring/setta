import React from "react";
import { useStoreState } from "easy-peasy";

import { getBreadCrumbPath } from "../../../../../../utils/sectionIds";

import TheBreadCrumb from "./TheBreadcrumb/TheBreadCrumb";

const Breadcrumbs = ({ rootId }) => {
  const visibleSectionIds = useStoreState(
    (state) => state.master.visibleSectionIds
  );
  const sectionIdsToSectionNames = useStoreState(
    (state) => state.master.sectionIdsToSectionNames
  );
  const { breadCrumbPath, idLineage } = getBreadCrumbPath(
    rootId,
    visibleSectionIds,
    sectionIdsToSectionNames
  );

  console.log("BreadCrumbs");

  return (
    <TheBreadCrumb breadCrumbPath={breadCrumbPath} idLineage={idLineage} />
  );
};

export default React.memo(Breadcrumbs);
