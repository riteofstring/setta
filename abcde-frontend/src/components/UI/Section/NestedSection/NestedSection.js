import { Grid, Stack, theme } from "@chakra-ui/react";
import SectionContainer from "../SectionContainer/SectionContainer";
import { useStoreState } from "easy-peasy";

const borderLeft = theme.colors.gray;

export default function NestedSection({
  parentId,
  rootId,
  sectionId,
  nextId,
  idx,
  depth,
  updatePosition,
  updateOrder,
}) {
  const theSection = useStoreState((state) => state.master.sections[sectionId]);
  const isShown = useStoreState((state) => state.master.isShown[parentId]);
  const isVisible = useStoreState((state) => state.master.isVisible[sectionId]);
  const idHierarchy = useStoreState(
    (state) => state.master.idHierarchy[sectionId]
  );

  const isListRoot = useStoreState(
    (state) => state.master.isListRoot[sectionId]
  );

  console.log("isShown", parentId, isShown);

  return (
    isVisible && (
      <Stack
        direction="column"
        pl="1rem"
        ml=".5rem"
        boxShadow={`inset 0.25rem 0px 0px 0px ${borderLeft[50]}`}
      >
        <Grid gap={2}>
          {isShown && (
            <SectionContainer
              sectionId={sectionId}
              rootId={rootId}
              parentId={parentId}
              nextId={nextId}
              childrenIds={idHierarchy.children}
              theSection={theSection}
              depth={depth}
            />
          )}
        </Grid>
      </Stack>
    )
  );
}
