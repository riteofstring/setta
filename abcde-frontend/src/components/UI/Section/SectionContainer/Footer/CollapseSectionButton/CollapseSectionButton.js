import { Icon, GridItem, IconButton } from "@chakra-ui/react";
import {
  HiChevronUp, // HiChevronDown,
} from "react-icons/hi";

export default function CollapseSectionButton() {
  return (
    <GridItem
      justifySelf="center"
      colStart="1"
      colEnd="2"
      rowStart="1"
      rowEnd="2"
    >
      <IconButton
        variant="ghost"
        color="gray.500"
        aria-label="Search database"
        icon={<Icon cursor="pointer" as={HiChevronUp} />}
        tabIndex="-1"
      />
    </GridItem>
  );
}
