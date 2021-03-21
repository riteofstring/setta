import React, { useState } from "react";
import { Grid, Stack, theme } from "@chakra-ui/react";
import SectionContainer from "../SectionContainer/SectionContainer";
import { useStoreState } from "easy-peasy";
import { motion } from "framer-motion";
import { useMeasurePosition } from "../../../../utils/useMeasurePosition";

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
  const isShown = useStoreState((state) => state.master.isShown[parentId]);
  const isVisible = useStoreState((state) => state.master.isVisible[sectionId]);

  const isList = useStoreState((state) => state.master.isList[sectionId]);

  const isListRoot = useStoreState(
    (state) => state.master.isListRoot[sectionId]
  );

  const getNestedSection = () => {
    return (
      isShown && (
        <SectionContainer
          sectionId={sectionId}
          rootId={rootId}
          parentId={parentId}
          nextId={nextId}
          depth={depth}
        />
      )
    );
  };

  const MotionDivWrapper = (inner) => {
    const [isDragging, setDragging] = useState(false);

    const ref = useMeasurePosition((pos) => updatePosition(idx, pos));

    return (
      <motion.div
        id="NESTED"
        ref={ref}
        layout
        initial={false}
        whileHover={{
          scale: 1.01,
          boxShadow: "0px 3px 3px rgba(0,0,0,0.15)",
        }}
        whileTap={{
          scale: 1.03,
          boxShadow: "0px 5px 5px rgba(0,0,0,0.1)",
        }}
        drag="y"
        onDragStart={() => setDragging(true)}
        onDragEnd={() => setDragging(false)}
        onViewportBoxUpdate={(_viewportBox, delta) => {
          isDragging && updateOrder(idx, delta.y.translate);
        }}
      >
        {inner}
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
            ? MotionDivWrapper(getNestedSection())
            : getNestedSection()}
        </Grid>
      </Stack>
    )
  );
}
