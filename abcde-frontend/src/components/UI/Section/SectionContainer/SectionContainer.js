import React, { useEffect, useRef } from "react";
import { Stack, HStack } from "@chakra-ui/react";
import { DragHandleIcon } from "@chakra-ui/icons";
import { useStoreActions, useStoreState } from "easy-peasy";
import GroupContainer from "./Main/Group/GroupContainer";
import SectionSearch from "./Main/Search/Search";
import { SectionHeader, DummySectionHeader } from "./Header/SectionHeader";
import SectionFooter from "./Footer/SectionFooter";
import { usePositionReorder } from "../../../../utils/usePositionReorder";
import NestedSection from "../NestedSection/NestedSection";
import { arraysAreEqual } from "../../../../utils/commonFunctions";
import { SECTIONWIDTH } from "../../../../utils/constants";

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

  const childrenIds = useStoreState(
    (state) => state.master.sections.getChildrenIds(sectionId),
    arraysAreEqual
  );

  const [order, updatePosition, updateOrder] = usePositionReorder(childrenIds);

  console.log("sectionId nextId, order", sectionId, nextId, childrenIds, order);

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
        order.map((e, idx) => {
          return (
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
          );
        })}
    </Stack>
  );
}

function SectionContainerCore({ sectionId, parentId, nextId, dragControls }) {
  const sectionInfo = useStoreState(
    (state) => state.master.sections[sectionId]
  );

  const {isList, isListRoot} = useStoreState(
    (state) => state.master.sections.getListProps(sectionId)
  );

  const showSearch =
    sectionInfo && Object.keys(sectionInfo.parameterInfos).length === 0;

  return (
    <HStack
      direction="column"
      bg="gray.50"
      borderRadius="md"
      w={`${SECTIONWIDTH}px`}
    >
      {isList && !isListRoot && <DragHandle dragControls={dragControls} />}
      <Stack px="1.5rem" py="1.5rem" w={`${SECTIONWIDTH}px`}>
        <SectionHeader
          sectionId={sectionId}
          parentId={parentId}
          nextId={nextId}
          isList={isList}
          isListRoot={isListRoot}
        />
        {!isListRoot && (
          <Stack>
            {showSearch && <SectionSearch sectionId={sectionId} />}
            <GroupContainer sectionId={sectionId} sectionInfo={sectionInfo} />
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
