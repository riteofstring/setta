import { useState } from "react";
import { Flex, Heading, IconButton } from "@chakra-ui/react";
import { HiChevronRight, HiChevronLeft } from "react-icons/hi";
import { motion } from "framer-motion";
import TextEditor from "./TextEditor/TextEditor";

export default function UiEditor() {
  const [uiVis, setUiVis] = useState(false);
  function uiToggle() {
    setUiVis(!uiVis);
  }
  const variants = {
    open: { marginRight: "0rem" },
    closed: { marginRight: "-37.5rem" },
  };
  return (
    <motion.div
      initial="closed"
      animate={uiVis ? "open" : "closed"}
      variants={variants}
    >
      <Flex
        zIndex="2"
        py="2rem"
        pr="3rem"
        pl="0rem"
        bg="gray.50"
        w="40rem"
        direction="row-reverse"
        h="100%"
      >
        <Flex w="calc(40rem - 3rem)" h="100%" direction="column">
          <Heading as="h1" size="md" color="gray.500">
            Edit YAML
          </Heading>
          <TextEditor />
        </Flex>

        <IconButton
          icon={uiVis ? <HiChevronRight /> : <HiChevronLeft />}
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
