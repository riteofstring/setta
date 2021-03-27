import React, { useEffect, useState } from "react";
import { Stack, HStack, Skeleton } from "@chakra-ui/react";
import { DragHandleIcon } from "@chakra-ui/icons";
import { useStoreActions, useStoreState } from "easy-peasy";
import GroupContainer from "./Main/Group/GroupContainer";
import SectionSearch from "./Main/Search/Search";
import { SectionHeader } from "./Header/SectionHeader";
import SectionFooter from "./Footer/SectionFooter";
import { findIndex } from "../../../../utils/usePositionReorder";
import { NestedSection } from "../NestedSection/NestedSection";
import sizeMe from "react-sizeme";
import { arraysAreEqual } from "../../../../utils/commonFunctions";
import move from "array-move";

function _SectionContainer({
  sectionId,
  rootId,
  parentId,
  nextId,
  depth,
  dragControls,
  showNested = true,
  showSearch = true,
}) {
  const [childIsDragging, setChildIsDragging] = useState(false);

  // const setSectionSize = useStoreActions(
  //   (action) => action.sectionSizes.setSectionSize
  // );

  const setChildrenIds = useStoreActions(
    (action) => action.master.setChildrenIds
  );

  const currPage = useStoreState((state) => state.master.currPage);
  const childrenIds = useStoreState(
    (state) => state.master.idHierarchy[currPage][sectionId].children,
    arraysAreEqual
  );

  const childrenPositions = useStoreState(
    (state) => state.master.idHierarchy[currPage][sectionId].childrenPositions
  );

  const updateOrder = (i, dragOffset) => {
    const targetIndex = findIndex(i, dragOffset, childrenPositions);
    if (targetIndex !== i) setChildrenIds({sectionId, childrenIds: move(childrenIds, i, targetIndex)});
  };

  console.log("sectionId nextId, order", sectionId, nextId, childrenIds);

  // useEffect(() => {
  //   if (!childIsDragging) {
  //     if (order.length > 0) {
  //       setChildrenIds({ sectionId, childrenIds: order });
  //     }
  //   }
  // }, [childIsDragging]);

  return (
    <Stack height="100%">
      <SectionContainerCore
        sectionId={sectionId}
        parentId={parentId}
        nextId={nextId}
        dragControls={dragControls}
        // onSize={(size) => setSectionSize({ sectionId, size })}
        showSearch={showSearch}
      />
      {showNested &&
        childrenIds.length > 0 &&
        childrenIds.map((e, idx) => {
          return (
            <NestedSection
              parentId={sectionId}
              rootId={rootId}
              sectionId={e}
              nextId={childrenIds[idx + 1]}
              idx={idx}
              key={`Nested-Sec-${e}`}
              depth={depth + 1}
              // updatePosition={setChildrenPositions}
              updateOrder={updateOrder}
              // childIsDragging={childIsDragging}
              setChildIsDragging={setChildIsDragging}
              childrenPositions={childrenPositions}
            />
          );
        })}
    </Stack>
  );
}

// const SectionContainerCoreWithSizeMe = React.memo(
//   sizeMe({ monitorHeight: true })(SectionContainerCore)
// );

function _SectionContainerCore({
  sectionId,
  parentId,
  nextId,
  dragControls,
  showSearch,
}) {
  const theSection = useStoreState((state) => state.master.sections[sectionId]);
  const currPage = useStoreState((state) => state.master.currPage);
  const isList = useStoreState(
    (state) => state.master.idHierarchy[currPage][sectionId].isList
  );
  const isListRoot = useStoreState(
    (state) => state.master.idHierarchy[currPage][sectionId].isListRoot
  );

  const getSearchItems = () => {
    const { moduleInfos } = theSection;
    let output = [];
    for (let moduleName of Object.keys(moduleInfos)) {
      for (let objName of Object.keys(moduleInfos[moduleName].objs)) {
        output.push([moduleName, objName]);
      }
    }
    return output;
  };

  const searchItems = showSearch ? getSearchItems() : [];

  // temp_
  // const tempBool = true;
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
        {!isListRoot && showSearch && (
          <Stack>
            <SectionSearch sectionId={sectionId} items={searchItems} />
            <GroupContainer sectionId={sectionId} />
            <SectionFooter sectionId={sectionId} isListRoot={isListRoot} />
          </Stack>
        )}
      </Stack>
    </HStack>
  );
}

function _DragHandle({ dragControls }) {
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

export const SectionContainer = React.memo(_SectionContainer);
export const SectionContainerCore = React.memo(_SectionContainerCore);
export const DragHandle = React.memo(_DragHandle);
