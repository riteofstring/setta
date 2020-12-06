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
  const activeObj = useStoreState((state) => state.master.activeObj);
  const { breadCrumbPath, fullPath } = getBreadCrumbPath(
    getTopLevelSectionId(activeObj),
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
