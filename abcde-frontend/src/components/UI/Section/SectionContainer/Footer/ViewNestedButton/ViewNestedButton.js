import { Button, GridItem } from "@chakra-ui/react";

export default function ViewNestedButton({
  isListRoot,
  hasNested,
  childrenAreCollapsed,
  flipChildrenAreCollapsed,
}) {
  return (
    <GridItem
      justifySelf="flex-start"
      col="1"
      colEnd="2"
      rowStart="1"
      rowEnd="2"
    >
      {hasNested && !isListRoot ? (
        <Button size="sm" onClick={flipChildrenAreCollapsed}>
          {!childrenAreCollapsed ? "Hide Nested" : "Show Nested"}
        </Button>
      ) : (
        <></>
      )}
    </GridItem>
  );
}
