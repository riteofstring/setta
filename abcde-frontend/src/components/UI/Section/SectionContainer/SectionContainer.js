import React, { useEffect } from "react";
import { Stack, HStack } from "@chakra-ui/react";
import { DragHandleIcon } from "@chakra-ui/icons";
import { useStoreActions, useStoreState } from "easy-peasy";
import GroupContainer from "./Main/Group/GroupContainer";
import SectionSearch from "./Main/Search/Search";
import { SectionHeader } from "./Header/SectionHeader";
import SectionFooter from "./Footer/SectionFooter";
import { usePositionReorder } from "../../../../utils/usePositionReorder";
import NestedSection from "../NestedSection/NestedSection";
import { arraysAreEqual } from "../../../../utils/commonFunctions";
import { SECTIONWIDTH } from "../../../../utils/constants";
import { useSetSectionPosition } from "../../../../utils/useSetSectionPosition";
import SectionDescription from "./Main/SectionDescription/SectionDescription";

function SectionContainer({
  id,
  variableName,
  parentId,
  nextId,
  moduleInfos,
  depth,
  dragControls,
}) {
  const refForPosition = useSetSectionPosition(id);

  // const setChildrenIds = useStoreActions(
  //   (action) => action.master.setChildrenIds
  // );

  // const childrenIds = useStoreState(
  //   (state) => state.master.sections.getChildrenIds(sectionId),
  //   arraysAreEqual
  // );

  // const [order, updatePosition, updateOrder] = usePositionReorder(childrenIds);

  // console.log("SectionContainer", sectionId, nextId, childrenIds, order);

  // useEffect(() => {
  //   if (!arraysAreEqual(childrenIds, order)) {
  //     setChildrenIds({ sectionId, childrenIds: order });
  //   }
  // }, [order]);

  return (
    <Stack ref={refForPosition}>
      <SectionContainerCore
        id={id}
        variableName={variableName}
        parentId={parentId}
        nextId={nextId}
        dragControls={dragControls}
      />
      {/* {order.length > 0 &&
        order.map((e, idx) => {
          return (
            <NestedSection
              parentId={sectionId}
              sectionId={e}
              nextId={order[idx + 1]}
              idx={idx}
              key={`Nested-Sec-${e}`}
              depth={depth + 1}
              updatePosition={updatePosition}
              updateOrder={updateOrder}
            />
          );
        })} */}
    </Stack>
  );
}

function SectionContainerCore({ id, variableName, parentId, nextId, dragControls }) {
  // const moduleInfos = useStoreState(
  //   (state) => state.master.sections.getSectionInfo(sectionId).moduleInfos
  // );

  // const { isList, isListRoot, requiresKeyInput } = useStoreState((state) =>
  //   state.master.sections.getUIType(sectionId)
  // );

  // const showSearch = Object.keys(moduleInfos).length > 0;

  // // temp_
  // const tempBoolDesc = false;
  return (
    <HStack
      direction="column"
      bg="gray.50"
      borderRadius="md"
      w={`${SECTIONWIDTH}px`}
    >
      {/* {isList && <DragHandle dragControls={dragControls} />} */}
      <Stack px="1.5rem" py="1.5rem" w={`${SECTIONWIDTH}px`}>
        <SectionHeader
          id={id}
          variableName={variableName}
          parentId={parentId}
          nextId={nextId}
          // isList={isList}
          // isListRoot={isListRoot}
          // requiresKeyInput={requiresKeyInput}
        />
        {/* {!isListRoot && (
          <Stack>
            {showSearch && (
              <SectionSearch sectionId={sectionId} moduleInfos={moduleInfos} />
            )}
            {tempBoolDesc && <SectionDescription />}
            <GroupContainer sectionId={sectionId} />
            <SectionFooter sectionId={sectionId} isListRoot={isListRoot} />
          </Stack>
        )} */}
      </Stack>
    </HStack>
  );
}

function DragHandle({ dragControls }) {
  return (
    <HStack
      alignSelf="stretch"
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
