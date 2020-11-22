import React, { useState, useLayoutEffect } from "react";
import { Box, Flex } from "@chakra-ui/react";
import { useStoreState } from "easy-peasy";
import DetailsContainer from "./DetailsContainer/DetailsContainer";
import PaneHeading from "../PaneHeading/PaneHeading";

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
        <PaneHeading heading="Details" />

        {loaded && <DetailsContainer />}
      </Flex>
    </Box>
  );
};

export default DetailsPane;
