import React from "react";
import { useStoreState } from "easy-peasy";

import {
  getTopLevelSectionId,
  getBreadCrumbPath,
} from "../../../utils/sectionIds";

import { Flex } from "@chakra-ui/react";
import TheBreadCrumb from "./TheBreadcrumb/TheBreadCrumb";

const Breadcrumbs = () => {
  const { visibleSectionIds, activeObj } = useStoreState(
    (state) => state.master
  );
  const breadCrumbPath = getBreadCrumbPath(
    getTopLevelSectionId(activeObj),
    visibleSectionIds
  );

  return (
    <Flex
      w="100vw"
      height="5rem"
      position="fixed"
      top="0"
      bg="gray.100"
      justifyContent="center"
      alignItems="center"
      zIndex={10}
    >
      <TheBreadCrumb breadCrumbPath={breadCrumbPath} />
    </Flex>
  );
};

export default React.memo(Breadcrumbs);
