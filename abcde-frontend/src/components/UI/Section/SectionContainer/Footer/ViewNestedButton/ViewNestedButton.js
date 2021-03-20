import { Button, GridItem } from "@chakra-ui/react";

import { useStoreActions, useStoreState } from "easy-peasy";

export default function ViewNestedButton({ sectionId, isListRoot }) {
  const setIsShown = useStoreActions((actions) => actions.master.setIsShown);
  const isShown = useStoreState((state) => state.master.isShown[sectionId]);
  const sectionHasNested = useStoreState(
    (state) => state.master.sectionHasNested[sectionId]
  );
  const flipShown = () => {
    setIsShown({ sectionId, isShown: !isShown });
  };
  return (
    <GridItem
      justifySelf="flex-start"
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
  );
}
