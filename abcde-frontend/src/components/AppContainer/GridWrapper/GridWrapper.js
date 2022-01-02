import { GridItem, Flex } from "@chakra-ui/react";

export default function GridWrapper(props) {
  return (
    <StandardGrid {...props}>
      <FlexForm {...props}>{props.children}</FlexForm>
    </StandardGrid>
  );
}

function StandardGrid(props) {
  const {
    colStart = "1",
    colEnd = "2",
    rowStart = "2",
    rowEnd = "3",
    minH = "0",
    minW = "0",
    height = "100%",
    display = null,
    gridTemplateColumns = null,
    gridTemplateRows = null,
  } = props;
  return (
    <GridItem
      colStart={colStart}
      colEnd={colEnd}
      rowStart={rowStart}
      rowEnd={rowEnd}
      minH={minH}
      minW={minW}
      h={height}
      display={display}
      gridTemplateColumns={gridTemplateColumns}
      gridTemplateRows={gridTemplateRows}
    >
      {props.children}
    </GridItem>
  );
}

function FlexForm(props) {
  const {
    flexDirection = "column",
    width = "100%",
    minHeight = "200px",
    marginTop = "20vh",
    justifyContent = "center",
    alignItems = "center",
    flexFormWrap = false,
  } = props;
  if (flexFormWrap) {
    return (
      <Flex
        flexDirection={flexDirection}
        width={width}
        minHeight={minHeight}
        mt={marginTop}
        justifyContent={justifyContent}
        alignItems={alignItems}
      >
        {props.children}
      </Flex>
    );
  } else {
    return <>{props.children}</>;
  }
}
