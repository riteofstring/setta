import React from "react";
import { useStoreState } from "easy-peasy";
import { BiChevronRight } from "react-icons/bi";

import {
  Flex,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
} from "@chakra-ui/react";

const Breadcrumbs = () => {
  const { visibleSectionIds, activeObj } = useStoreState(
    (state) => state.master
  );
  console.log(visibleSectionIds);
  return (
    <Flex
      w="100vw"
      height="5rem"
      position="fixed"
      top="0"
      bg="gray.100"
      justifyContent="center"
      alignItems="center"
    >
      <Breadcrumb spacing="8px" separator={<BiChevronRight color="gray.500" />}>
        <BreadcrumbItem isCurrentPage={false}>
          <BreadcrumbLink href="#">CRUMB</BreadcrumbLink>
        </BreadcrumbItem>
      </Breadcrumb>
      {activeObj}:
    </Flex>
  );
};

export default React.memo(Breadcrumbs);
