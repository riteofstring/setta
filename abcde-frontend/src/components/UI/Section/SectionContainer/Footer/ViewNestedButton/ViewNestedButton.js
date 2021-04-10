import { Button, GridItem } from "@chakra-ui/react";

import { useStoreActions, useStoreState } from "easy-peasy";

export default function ViewNestedButton({ sectionId, isListRoot }) {
  const setChildrenAreCollapsed = useStoreActions((actions) => actions.master.setChildrenAreCollapsed);
  const sectionHasNested = useStoreState((state) =>
    state.master.sections.getHasNested(sectionId)
  );
  const childrenAreCollapsed = useStoreState(
    (state) => state.master.sections.getChildrenAreCollapsed(sectionId)
  );

  const flipShown = () => {
    setChildrenAreCollapsed({ sectionId, childrenAreCollapsed: !childrenAreCollapsed });
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
          {!childrenAreCollapsed ? "Hide Nested" : "Show Nested"}
        </Button>
      ) : (
        <></>
      )}
    </GridItem>
  );
}
