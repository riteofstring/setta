import { Grid, Icon, Button, GridItem } from "@chakra-ui/react";
import {
  HiChevronUp,
  // HiChevronDown,
} from "react-icons/hi";
import { useStoreActions, useStoreState } from "easy-peasy";

export default function SectionFooter({ sectionId, isListRoot }) {
  const setIsShown = useStoreActions((actions) => actions.master.setIsShown);
  const isShown = useStoreState((state) => state.master.isShown[sectionId]);
  const sectionHasNested = useStoreState(
    (state) => state.master.sectionHasNested[sectionId]
  );
  const flipShown = () => {
    setIsShown({ sectionId, isShown: !isShown });
  };

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
        {sectionHasNested && !isListRoot ? (
          <Button size="sm" onClick={flipShown}>
            {!!isShown ? "Hide Nested" : "Show Nested"}
          </Button>
        ) : (
          <></>
        )}
      </GridItem>
    </Grid>
  );
}
