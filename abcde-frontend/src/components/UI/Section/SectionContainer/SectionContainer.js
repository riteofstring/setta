import React, { useEffect, useState } from "react";
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
import {
  funcAddChild,
  funcDeleteChild,
  funcFlipChildrenAreCollapsed,
} from "./SectionContainerUtils";

export const ChildrenContext = React.createContext(null);

function SectionContainer({
  sectionId,
  parentId,
  nextId,
  sectionInfo,
  available,
  depth,
  dragControls,
  parentControls,
  isCollapsed,
}) {
  const refForPosition = useSetSectionPosition(sectionId);

  const [selectedItem, setSelectedItem] = useState([]);
  const [children, setChildren] = useState([]);
  const [childSectionInfo, setChildSectionInfo] = useState({});
  const [childrenAreCollapsed, setChildrenAreCollapsed] = useState(false);
  const [order, updatePosition, updateOrder] = usePositionReorder(children);
  const hasNested = children.length > 0;

  console.log("*********SectionContainer", sectionId, selectedItem);

  const addChild = funcAddChild(
    sectionInfo,
    available,
    children,
    childSectionInfo,
    setChildren,
    setChildSectionInfo
  );

  const deleteChild = funcDeleteChild(
    children,
    childSectionInfo,
    setChildren,
    setChildSectionInfo
  );

  const flipChildrenAreCollapsed = funcFlipChildrenAreCollapsed(
    childrenAreCollapsed,
    setChildrenAreCollapsed
  );

  useEffect(() => {
    if (!arraysAreEqual(children, order)) {
      setChildren(order);
    }
  }, [order]);

  useEffect(() => {
    setChildrenAreCollapsed(isCollapsed);
  }, [isCollapsed]);

  return (
    <Stack ref={refForPosition}>
      <ChildrenContext.Provider value={{ children, addChild }}>
        <SectionContainerCore
          sectionId={sectionId}
          parentId={parentId}
          nextId={nextId}
          sectionInfo={sectionInfo}
          dragControls={dragControls}
          addChild={addChild}
          deleteChild={deleteChild}
          parentControls={parentControls}
          hasNested={hasNested}
          childrenAreCollapsed={childrenAreCollapsed}
          flipChildrenAreCollapsed={flipChildrenAreCollapsed}
          selectedItem={selectedItem}
          setSelectedItem={setSelectedItem}
        />
      </ChildrenContext.Provider>
      {hasNested &&
        order.map((e, idx) => {
          return (
            <NestedSection
              parentId={sectionId}
              sectionId={e}
              nextId={order[idx + 1]}
              sectionInfo={childSectionInfo[e]}
              available={available}
              parentControls={{ addChild, deleteChild }}
              idx={idx}
              key={`Nested-Sec-${e}`}
              depth={depth + 1}
              updatePosition={updatePosition}
              updateOrder={updateOrder}
              isCollapsed={childrenAreCollapsed}
            />
          );
        })}
    </Stack>
  );
}

function SectionContainerCore({
  sectionId,
  parentId,
  nextId,
  sectionInfo,
  dragControls,
  addChild,
  deleteChild,
  parentControls,
  hasNested,
  childrenAreCollapsed,
  flipChildrenAreCollapsed,
  selectedItem,
  setSelectedItem,
}) {
  const { name: variableName, moduleInfos, isList, isListRoot } = sectionInfo;
  const showSearch = Object.keys(moduleInfos).length > 0;

  const [paramInfos, setParamInfos] = useState(sectionInfo.parameterInfos);

  function onSelectedItemChange(inputSelectedItem) {
    if (inputSelectedItem) {
      const [moduleName, objName] = inputSelectedItem;
      setParamInfos(moduleInfos[moduleName].objs[objName].params);
      setSelectedItem(inputSelectedItem);
    }
  }

  // console.log("paramInfos", variableName, paramInfos);
  // console.log("dragControls", dragControls);

  // // temp_
  const tempBoolDesc = false;
  return (
    <HStack
      direction="column"
      bg="gray.50"
      borderRadius="md"
      w={`${SECTIONWIDTH}px`}
    >
      {isList && <DragHandle dragControls={dragControls} />}
      <Stack px="1.5rem" py="1.5rem" w={`${SECTIONWIDTH}px`}>
        <SectionHeader
          sectionId={sectionId}
          variableName={variableName}
          parentId={parentId}
          nextId={nextId}
          isList={isList}
          isListRoot={isListRoot}
          addChild={addChild}
          deleteChild={deleteChild}
          parentControls={parentControls}
          // requiresKeyInput={requiresKeyInput}
        />
        {!isListRoot && (
          <Stack>
            {showSearch && (
              <SectionSearch
                moduleInfos={moduleInfos}
                initialSelection={selectedItem}
                onSelectedItemChange={onSelectedItemChange}
              />
            )}
            {tempBoolDesc && <SectionDescription />}
            <GroupContainer sectionId={sectionId} paramInfos={paramInfos} />
            <SectionFooter
              sectionId={sectionId}
              isListRoot={isListRoot}
              hasNested={hasNested}
              childrenAreCollapsed={childrenAreCollapsed}
              flipChildrenAreCollapsed={flipChildrenAreCollapsed}
            />
          </Stack>
        )}
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
