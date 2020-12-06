import React from "react";
import { useStoreState } from "easy-peasy";

import {
  getTopLevelSectionId,
  getBreadCrumbPath,
} from "../../../../../../utils/sectionIds";

import TheBreadCrumb from "./TheBreadcrumb/TheBreadCrumb";

const Breadcrumbs = () => {
  const visibleSectionIds = useStoreState(
    (state) => state.master.visibleSectionIds
  );
  const sectionId = useStoreState((state) => state.globalCurr.sectionId);
  const { breadCrumbPath, fullPath } = getBreadCrumbPath(
    getTopLevelSectionId(sectionId),
    visibleSectionIds
  );

  return (
    <>
      {visibleSectionIds.length > 0 && (
        <TheBreadCrumb breadCrumbPath={breadCrumbPath} fullPath={fullPath} />
      )}
    </>
  );
};

export default React.memo(Breadcrumbs);
