import React, { useEffect } from "react";
import { Stack, HStack } from "@chakra-ui/react";
import { DragHandleIcon } from "@chakra-ui/icons";
import { useStoreActions, useStoreState } from "easy-peasy";
import GroupContainer from "./Main/Group/GroupContainer";
import SectionSearch from "./Main/Search/Search";
import SectionHeader from "./Header/SectionHeader";
import SectionFooter from "./Footer/SectionFooter";
import { usePositionReorder } from "../../../../utils/usePositionReorder";
import NestedSection from "../NestedSection/NestedSection";
import sizeMe from "react-sizeme";
import { arraysAreEqual } from "../../../../utils/commonFunctions";

function SectionContainer({ sectionId, rootId, parentId, nextId, depth }) {
  const setSectionSize = useStoreActions(
    (action) => action.sectionSizes.setSectionSize
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

  return (
    <Stack height="100%">
      <SectionContainerCoreWithSizeMe
        sectionId={sectionId}
        parentId={parentId}
        nextId={nextId}
        onSize={(size) => setSectionSize({ sectionId, size })}
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

// const SectionContainerCoreWithSizeMe = React.memo(
//   sizeMe({ monitorHeight: true })(SectionContainerCore)
// );

function SectionContainerCore({ sectionId, parentId, nextId }) {
  const theSection = useStoreState((state) => state.master.sections[sectionId]);
  const currPage = useStoreState((state) => state.master.currPage);
  const isList = useStoreState((state) => state.master.idHierarchy[currPage][sectionId].isList);
  const isListRoot = useStoreState((state) => state.master.idHierarchy[currPage][sectionId].isListRoot);

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

  // temp_
  const tempBool = true;
  return (
    <HStack direction="column" bg="gray.50" borderRadius="md" w="650px">
      {isList && !isListRoot && (
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
            {tempBool && (
              <SectionSearch sectionId={sectionId} items={searchItems} />
            )}
            <GroupContainer sectionId={sectionId} />
            <SectionFooter sectionId={sectionId} isListRoot={isListRoot} />
          </Stack>
        )}
      </Stack>
    </HStack>
  );
}

export default React.memo(SectionContainer);
const SectionContainerCoreWithSizeMe = React.memo(SectionContainerCore)
