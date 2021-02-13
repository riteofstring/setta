import {
  Grid,
  Icon,
  FormLabel,
  FormControl,
  Switch,
  GridItem,
} from "@chakra-ui/react";
import {
  HiChevronUp,
  // HiChevronDown,
} from "react-icons/hi";

export default function SectionFooter() {
  return (
    <Grid w="100%" py="0.5rem" alignItems="center">
      <GridItem
        justifySelf="center"
        colStart="1"
        colEnd="2"
        rowStart="1"
        rowEnd="2"
      >
        <Icon cursor="pointer" as={HiChevronUp} />
      </GridItem>

      <GridItem
        justifySelf="flex-end"
        col="1"
        colEnd="2"
        rowStart="1"
        rowEnd="2"
      >
        <FormControl display="flex" alignItems="center">
          <FormLabel
            fontSize="sm"
            fontWeight="semibold"
            color="gray.400"
            mr="0.5rem"
            htmlFor="reveal-group"
            mb="0"
          >
            Reveal by Group
          </FormLabel>
          <Switch size="sm" id="reveal-group" />
        </FormControl>
      </GridItem>
    </Grid>
  );
}
