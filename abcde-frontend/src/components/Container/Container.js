import React from "react";
import SectionsPane from "../SectionsPane/SectionsPane";
import DetailsPane from "../DetailsPane/DetailsPane";
import Submit from "../Submit/Submit";
import { Flex } from "@chakra-ui/react";

const Container = () => {
  return (
    <Flex align="center" justify="center" h="100vh">
      <Flex w="95vw" maxWidth={1600} h="100%" p="5rem">
        <SectionsPane />
        <DetailsPane />
        <Submit />
      </Flex>
    </Flex>
  );
};

export default React.memo(Container);
