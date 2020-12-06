import React from "react";
import { useStoreActions } from "easy-peasy";

import { Breadcrumb, BreadcrumbItem, BreadcrumbLink } from "@chakra-ui/react";
import { BiChevronRight } from "react-icons/bi";

const TheBreadcrumb = ({ breadCrumbPath, idLineage }) => {
  const setSectionId = useStoreActions(
    (actions) => actions.globalCurr.setSectionId
  );

  const setShiftAmount = useStoreActions(
    (actions) => actions.master.setShiftAmount
  );
  const setInFocus = useStoreActions((actions) => actions.master.setInFocus);

  const applyFocus = (breadcrumbIdx) => {
    const sectionId = idLineage[breadcrumbIdx];
    setInFocus(sectionId);
    setSectionId(sectionId);
    setShiftAmount({ rootId: idLineage[0], shiftAmount: breadcrumbIdx });
  };

  console.log("TheBreadcrumb", idLineage);

  return (
    <Breadcrumb spacing="8px" separator={<BiChevronRight color="gray.500" />}>
      {breadCrumbPath.map((e, idx) => (
        <BreadcrumbItem key={`crumbitem-${idx}`}>
          <BreadcrumbLink
            onClick={() => applyFocus(idx)}
            href={`#${idLineage[idx]}`}
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
