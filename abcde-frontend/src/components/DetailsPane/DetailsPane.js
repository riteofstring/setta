import React, { useState, useLayoutEffect } from "react";
import { Box, Flex, HStack, Heading, css } from "@chakra-ui/react";
import { useStoreState } from "easy-peasy";
import DetailsContainer from "./DetailsContainer/DetailsContainer";

const DetailsPane = () => {
  const { activeObj } = useStoreState((state) => state.master);

  const [loaded, isLoaded] = useState(false);

  const setLoaded = () => {
    isLoaded(true);
  };
  useLayoutEffect(() => {
    if (activeObj) {
      setLoaded();
    }
  });

  return (
    <Box
    // css={css`
    //   align-items: flex-start;
    // `}
    >
      <Flex
        align="flex-start"
        flexDir="column"
        boxShadow="xl"
        bg="gray.50"
        borderRadius="3xl"
        padding="5rem"
      >
        <Heading as="h1" size="2xl" color="gray.600">
          Details
        </Heading>

        {loaded && <DetailsContainer />}
      </Flex>
    </Box>
  );
};

export default DetailsPane;
