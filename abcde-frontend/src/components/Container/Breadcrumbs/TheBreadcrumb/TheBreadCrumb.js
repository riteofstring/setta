import React from "react";
import { useStoreActions, useStoreState } from "easy-peasy";

import { Breadcrumb, BreadcrumbItem, BreadcrumbLink } from "@chakra-ui/react";
import { BiChevronRight } from "react-icons/bi";

import {
  getTopLevelSectionId,
  getBreadCrumbPath,
} from "../../../../utils/sectionIds";

const TheBreadcrumb = ({ breadCrumbPath }) => {
  const { setActiveObj } = useStoreActions((actions) => actions.master);
  const { visibleSectionIds, selected, activeObj } = useStoreState(
    (state) => state.master
  );

  console.log(breadCrumbPath);

  const setFocus = (breadcrumb) => {
    // setActiveObj(breadcrumb);
    console.log(getTopLevelSectionId);
    console.log(breadCrumbPath);
  };

  return (
    <Breadcrumb spacing="8px" separator={<BiChevronRight color="gray.500" />}>
      {breadCrumbPath.map((e, idx) => (
        <BreadcrumbItem key={`crumbitem-${idx}`}>
          <BreadcrumbLink
            onClick={() => setFocus(e)}
            href="#"
            key={`crumblink-${idx}`}
          >
            {e}
          </BreadcrumbLink>
        </BreadcrumbItem>
      ))}
    </Breadcrumb>
  );
};

export default React.memo(TheBreadcrumb);
