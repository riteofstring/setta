import React, { useState, useRef, useEffect } from "react";
import { Grid, Stack, theme } from "@chakra-ui/react";
import { SectionContainer } from "../SectionContainer/SectionContainer";
import { useStoreState, useStoreActions } from "easy-peasy";
import { motion, useDragControls } from "framer-motion";
import { useMeasurePosition } from "../../../../utils/useMeasurePosition";

const borderLeft = theme.colors.gray;

export const NestedSection = React.memo(_NestedSection);

function _NestedSection({
  parentId,
  rootId,
  sectionId,
  nextId,
  idx,
  depth,
  // updatePosition,
  updateOrder,
  setChildIsDragging,
}) {
  // console.log("sectionId idx", sectionId, idx);

  const currPage = useStoreState((state) => state.master.currPage);
  const isShown = useStoreState(
    (state) => state.master.idHierarchy[currPage][parentId].isShown
  );
  const isVisible = useStoreState(
    (state) => state.master.idHierarchy[currPage][sectionId].isVisible
  );
  const isList = useStoreState(
    (state) => state.master.idHierarchy[currPage][sectionId].isList
  );
  const isListRoot = useStoreState(
    (state) => state.master.idHierarchy[currPage][sectionId].isListRoot
  );

  const setChildrenPositions = useStoreActions(
    (action) => action.master.setChildrenPositions
  );

  const ref = useRef(null);

  const getNestedSection = (dragControls, isDragging = false) => {
    return (
      <SectionContainer
        sectionId={sectionId}
        rootId={rootId}
        parentId={parentId}
        nextId={nextId}
        depth={depth}
        dragControls={dragControls}
        showNested={true}
        showSearch={true}
      />
    );
  };

  useEffect(()=>{
    console.log("ref.current useEffect")
    if (ref.current){
      setChildrenPositions({
        sectionId: parentId,
        idx,
        position: {
          height: ref.current.offsetHeight,
          top: ref.current.offsetTop,
        },
      });
    }
  },[idx])


  const MotionDivWrapper = (inner) => {
    const dragControls = useDragControls();
    const [isDragging, setDragging] = useState(false);

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
          setChildIsDragging(true);
        }}
        onDragEnd={(event, info) => {
          setDragging(false);
          setChildIsDragging(false);
          console.log("event", event)
          console.log("info", info)
          updateOrder(idx, info.offset.y);
        }}
        // onViewportBoxUpdate={(_viewportBox, delta) => {
        //   isDragging && 
        // }}
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
