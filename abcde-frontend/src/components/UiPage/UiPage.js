import React from "react";
import SectionsPane from "./SectionsPane/SectionsPane";
import DetailsPane from "./DetailsPane/DetailsPane";
import Submit from "./Submit/Submit";
import { Flex } from "@chakra-ui/react";

const UiPage = () => {
  return (
    <>
      <DetailsPane />
      <Flex w="95vw" maxWidth={1600} minHeight="100vh" p="5rem">
        <SectionsPane />
      </Flex>
      <Submit />
    </>
  );
};

export default React.memo(UiPage);
