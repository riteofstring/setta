import React, { useEffect, useState } from "react";
import { Stack, HStack, Flex } from "@chakra-ui/react";
import { DragHandleIcon } from "@chakra-ui/icons";
import { useStoreActions, useStoreState } from "easy-peasy";
import GroupContainer from "../Main/Group/GroupContainer";
import SectionSearch from "../Main/Search/Search";
import SectionHeader from "../Header/SectionHeader";
import SectionFooter from "../Footer/SectionFooter";
import { createStringId } from "../../../../utils/sectionIds";
import { usePositionReorder } from "../../../../utils/usePositionReorder";
import NestedSection from "../NestedSection/NestedSection";
import { hidden } from "ansi-colors";
import sizeMe from "react-sizeme";

export default function SectionContainer({
  sectionId,
  rootId,
  parentId,
  nextId,
  childrenIds,
  theSection,
  depth,
}) {

  const setSectionSize = useStoreActions(
    (action) => action.sectionSizes.setSectionSize
  );

  const setChildrenIds = useStoreActions(
    (action) => action.master.setChildrenIds
  );

  const [order, updatePosition, updateOrder] = usePositionReorder(childrenIds);

  console.log("sectionId order", sectionId, order);

  useEffect(() => {
    if (order.length > 0) {
      setChildrenIds({ sectionId, childrenIds: order });
    }
  }, [order]);

  return (
    <Stack height="100%">
        <SectionContainerCoreWithSizeMe
          sectionId={sectionId}
          rootId={rootId}
          parentId={parentId}
          nextId={nextId}
          childrenIds={childrenIds}
          theSection={theSection}
          depth={depth}
          onSize={(size)=>setSectionSize({sectionId, size})}
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

const SectionContainerCoreWithSizeMe = sizeMe({ monitorHeight: true })(SectionContainerCore)

function SectionContainerCore({ sectionId, rootId, parentId, nextId, childrenIds, theSection, depth }) {
  const selected = useStoreState((state) => state.master.selected[sectionId]);

  const stringId = createStringId(
    sectionId,
    selected.moduleName,
    selected.name
  );

  const sectionModuleObjHasNested = useStoreState(
    (state) => state.master.sectionModuleObjHasNested[stringId]
  );
  const shiftAmount = useStoreState(
    (state) => state.master.shiftAmount[sectionId]
  );
  const isList = useStoreState((state) => state.master.isList[sectionId]);
  const isListRoot = useStoreState(
    (state) => state.master.isListRoot[sectionId]
  );

  const inFocus = useStoreState((state) => state.master.inFocus[sectionId]);

  const setShiftAmount = useStoreActions(
    (actions) => actions.master.setShiftAmount
  );

  const setInFocus = useStoreActions((actions) => actions.master.setInFocus);

  const applyFocus = () => {
    if (!inFocus) {
      setInFocus(sectionId);
      setShiftAmount({ rootId, shiftAmount: depth });
    }
  };

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

  const searchItems = getSearchItems();

  return (
    <HStack direction="column" bg="gray.50" borderRadius="md" w="700px">
      {!!isList & !isListRoot && (
        <HStack
          h="100%"
          borderLeftRadius="inherit"
          cursor="move"
          px="0.5rem"
          bg="gray.100"
        >
          <DragHandleIcon size="sm" color="gray.300" />
        </HStack>
      )}

      <Stack
        pr="1.5rem"
        pl="1rem"
        py="1rem"
        w="700px"
        onClick={() => applyFocus()}
      >
        <SectionHeader
          sectionId={sectionId}
          parentId={parentId}
          nextId={nextId}
          childrenIds={childrenIds}
          isList={isList}
          isListRoot={isListRoot}
        />
        {!isListRoot && (
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
