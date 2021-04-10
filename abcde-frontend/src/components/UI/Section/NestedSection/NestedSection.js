import React, { useState } from "react";
import { Grid, Stack, theme } from "@chakra-ui/react";
import SectionContainer from "../SectionContainer/SectionContainer";
import { useStoreState } from "easy-peasy";
import { motion, useDragControls } from "framer-motion";
import { useMeasurePosition } from "../../../../utils/useMeasurePosition";

const borderLeft = theme.colors.gray;

export default function NestedSection({
  parentId,
  sectionId,
  nextId,
  idx,
  depth,
  updatePosition,
  updateOrder,
}) {
  const childrenAreCollapsed = useStoreState((state) =>
    state.master.sections.getChildrenAreCollapsed(parentId)
  );
  const isVisible = useStoreState((state) =>
    state.master.sections.getIsVisible(sectionId)
  );
  const { isList, isListRoot } = useStoreState((state) =>
    state.master.sections.getListProps(sectionId)
  );

  const getNestedSection = (dragControls) => {
    return (
      !childrenAreCollapsed && (
        <SectionContainer
          sectionId={sectionId}
          parentId={parentId}
          nextId={nextId}
          depth={depth}
          dragControls={dragControls}
        />
      )
    );
  };

  const MotionDivWrapper = (inner) => {
    const dragControls = useDragControls();
    const [isDragging, setDragging] = useState(false);

    const ref = useMeasurePosition((pos) => updatePosition(idx, pos));

    return (
      <motion.div
        id="NESTED"
        ref={ref}
        layout
        initial={false}
        whileDrag={{
          scale: 1.03,
          boxShadow: "0px 5px 5px rgba(0,0,0,0.1)",
        }}
        drag="y"
        onDragStart={() => {
          setDragging(true);
        }}
        onDragEnd={() => {
          setDragging(false);
        }}
        onViewportBoxUpdate={(_viewportBox, delta) => {
          isDragging && updateOrder(idx, delta.y.translate);
        }}
        dragListener={false}
        dragControls={dragControls}
      >
        {inner(dragControls, isDragging)}
      </motion.div>
    );
  };

  return (
    isVisible && (
      <Stack
        direction="column"
        pl="1rem"
        ml=".5rem"
        boxShadow={`inset 0.25rem 0px 0px 0px ${borderLeft[50]}`}
      >
        <Grid gap={2}>
          {isList && !isListRoot
            ? MotionDivWrapper(getNestedSection)
            : getNestedSection()}
        </Grid>
      </Stack>
    )
  );
}
