import React from "react";
import { useStoreActions } from "easy-peasy";

import { Breadcrumb, BreadcrumbItem, BreadcrumbLink } from "@chakra-ui/react";
import { BiChevronRight } from "react-icons/bi";

const TheBreadcrumb = ({ breadCrumbPath, fullPath }) => {
  const setSectionId = useStoreActions((actions) => actions.globalCurr.setSectionId);

  const setFocus = (breadcrumbIdx) => {
    setSectionId(fullPath[breadcrumbIdx]);
  };

  return (
    <Breadcrumb spacing="8px" separator={<BiChevronRight color="gray.500" />}>
      {breadCrumbPath.map((e, idx) => (
        <BreadcrumbItem key={`crumbitem-${idx}`}>
          <BreadcrumbLink
            onClick={() => setFocus(idx)}
            href={`#${fullPath[idx]}`}
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
