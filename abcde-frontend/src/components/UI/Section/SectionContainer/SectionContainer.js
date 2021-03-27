import React, { useEffect, useRef } from "react";
import { Stack, HStack } from "@chakra-ui/react";
import { DragHandleIcon } from "@chakra-ui/icons";
import { useStoreActions, useStoreState } from "easy-peasy";
import GroupContainer from "./Main/Group/GroupContainer";
import SectionSearch from "./Main/Search/Search";
import SectionHeader from "./Header/SectionHeader";
import SectionFooter from "./Footer/SectionFooter";
import { usePositionReorder } from "../../../../utils/usePositionReorder";
import NestedSection from "../NestedSection/NestedSection";
import { arraysAreEqual } from "../../../../utils/commonFunctions";

function SectionContainer({
  sectionId,
  rootId,
  parentId,
  nextId,
  depth,
  dragControls,
}) {
  const refForPosition = useRef(null);

  const setSectionPosition = useStoreActions(
    (action) => action.sectionPositions.setSectionPosition
  );

  const setChildrenIds = useStoreActions(
    (action) => action.master.setChildrenIds
  );

  const currPage = useStoreState((state) => state.master.currPage);
  const childrenIds = useStoreState(
    (state) => state.master.idHierarchy[currPage][sectionId].children,
    arraysAreEqual
  );

  const [order, updatePosition, updateOrder] = usePositionReorder(childrenIds);

  console.log("sectionId nextId, order", sectionId, nextId, childrenIds, order);

  useEffect(() => {
    if (order.length > 0) {
      setChildrenIds({ sectionId, childrenIds: order });
    }
  }, [order]);

  useEffect(() => {
    if (refForPosition.current) {
      setSectionPosition({
        sectionId,
        position: refForPosition.current.offsetTop,
        height: refForPosition.current.clientHeight,
      });
    }
  }, [refForPosition.current]);

  return (
    <Stack height="100%" ref={refForPosition}>
      <SectionContainerCore
        sectionId={sectionId}
        parentId={parentId}
        nextId={nextId}
        dragControls={dragControls}
      />
      {order.length > 0 &&
        order.map((e, idx) => (
          <NestedSection
            parentId={sectionId}
            rootId={rootId}
            sectionId={e}
            nextId={order[idx + 1]}
            idx={idx}
            key={`Nested-Sec-${e}`}
            depth={depth + 1}
            updatePosition={updatePosition}
            updateOrder={updateOrder}
          />
        ))}
    </Stack>
  );
}

function SectionContainerCore({ sectionId, parentId, nextId, dragControls }) {
  const currPage = useStoreState((state) => state.master.currPage);
  const isList = useStoreState(
    (state) => state.master.idHierarchy[currPage][sectionId].isList
  );
  const isListRoot = useStoreState(
    (state) => state.master.idHierarchy[currPage][sectionId].isListRoot
  );

  // temp_
  const tempBool = true;
  return (
    <HStack direction="column" bg="gray.50" borderRadius="md" w="650px">
      {isList && !isListRoot && <DragHandle dragControls={dragControls} />}
      <Stack px="1.5rem" py="1.5rem" w="700px">
        <SectionHeader
          sectionId={sectionId}
          parentId={parentId}
          nextId={nextId}
          isList={isList}
          isListRoot={isListRoot}
        />
        {!isListRoot && (
          <Stack>
            {tempBool && <SectionSearch sectionId={sectionId} />}
            <GroupContainer sectionId={sectionId} />
            <SectionFooter sectionId={sectionId} isListRoot={isListRoot} />
          </Stack>
        )}
      </Stack>
    </HStack>
  );
}

function DragHandle({ dragControls }) {
  return (
    <HStack
      h="100%"
      borderLeftRadius="inherit"
      cursor="move"
      px="0.5rem"
      bg="gray.100"
      className="DragHandle"
      onMouseDown={(e) => dragControls.start(e)}
    >
      <DragHandleIcon size="sm" color="gray.300" />
    </HStack>
  );
}

export default React.memo(SectionContainer);
