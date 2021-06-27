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
  sectionInfo,
  available,
  parentControls,
  idx,
  depth,
  updatePosition,
  updateOrder,
  isCollapsed,
}) {
  const getNestedSection = (dragControls) => {
    return (
      <SectionContainer
        sectionId={sectionId}
        parentId={parentId}
        nextId={nextId}
        sectionInfo={sectionInfo}
        available={available}
        depth={depth}
        dragControls={dragControls}
        parentControls={parentControls}
        isCollapsed={isCollapsed}
      />
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
        {inner(dragControls)}
      </motion.div>
    );
  };

  const StackWrapper = (inner) => {
    return (
      <Stack
        direction="column"
        pl="1rem"
        ml=".5rem"
        boxShadow={`inset 0.25rem 0px 0px 0px ${borderLeft[50]}`}
      >
        <Grid gap={2}>{inner}</Grid>
      </Stack>
    );
  };

  const WithOrWithoutMotion = () => {
    return sectionInfo.isList
      ? MotionDivWrapper(getNestedSection)
      : getNestedSection();
  };

  return StackWrapper(WithOrWithoutMotion());
}
