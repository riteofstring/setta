import React from "react";
import SectionsPane from "../SectionsPane/SectionsPane";
import DetailsPane from "../DetailsPane/DetailsPane";
import Submit from "../Submit/Submit";
import { Flex, Box, css, chakra } from "@chakra-ui/react";
import styled from "@emotion/styled";
import Breadcrumbs from "../Breadcrumbs/Breadcrumbs";

const Container = () => {
  return (
    <>
      <Breadcrumbs />
      <DetailsPane />
      <Flex align="center" justify="center">
        <Flex w="95vw" maxWidth={1600} minHeight="100vh" p="5rem">
          <SectionsPane />
        </Flex>
      </Flex>
      <Submit />
    </>
  );
};

export default React.memo(Container);
