import { useState } from "react";
import { Flex, Heading, IconButton } from "@chakra-ui/react";
import { HiChevronRight, HiChevronLeft } from "react-icons/hi";
import SectionList from "./SectionList/SectionList";
import { motion } from "framer-motion";

export default function Overview() {
  const [uiVis, setUiVis] = useState(true);
  function uiToggle() {
    setUiVis(!uiVis);
  }

  const variants = {
    open: { marginLeft: "0rem" },
    closed: { marginLeft: "-17.5rem" },
  };
  return (
    <motion.div animate={uiVis ? "open" : "closed"} variants={variants}>
      <Flex
        zIndex="2"
        py="2rem"
        pr="0rem"
        pl="3rem"
        bg="gray.50"
        w="20rem"
        height="100%"
      >
        <Flex
          bg="whiteAlpha"
          flexDirection="column"
          height="100%"
          minW="12.5rem"
          w="100%"
          id="nestedFlexThing"
        >
          <Heading as="h2" size="md" color="gray.500" pb=".5rem">
            Overview
          </Heading>
          <SectionList />
        </Flex>

        <IconButton
          icon={uiVis ? <HiChevronLeft /> : <HiChevronRight />}
          color="gray.500"
          bg="whiteAlpha"
          size="sm"
          ml="0.25rem"
          mr="0.5rem"
          alignSelf="center"
          onClick={uiToggle}
        />
      </Flex>
    </motion.div>
  );
}
