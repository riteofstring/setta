import React, { useEffect, useState } from "react";
import { useStoreState, useStoreActions } from "easy-peasy";
import { Stack, HStack, Box } from "@chakra-ui/react";
import { DragHandleIcon } from "@chakra-ui/icons";
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
import { funcFlipChildrenAreCollapsed } from "./SectionContainerUtils";

export const ChildrenContext = React.createContext(null);

function SectionContainer({
  sectionId,
  parentId,
  nextId,
  sectionInfo,
  available,
  depth,
  dragControls,
  isCollapsed,
  setIdsOverview,
  setIdNames,
}) {
  const children = useStoreState((x) => x.sections.children[sectionId]);
  const setChildren = useStoreActions((x) => x.sections.setChildren);
  const [selectedItem, setSelectedItem] = useState([]);
  const [childSectionInfo, setChildSectionInfo] = useState({});
  const [childrenAreCollapsed, setChildrenAreCollapsed] = useState(false);
  const [order, updatePosition, updateOrder] = usePositionReorder(children);
  const hasNested = children.length > 0;

  console.log("*********SectionContainer", children);

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

  useEffect(() => {
    setIdsOverview({ sectionId, children });
    setIdNames({ sectionId, name: sectionInfo.name });
  }, [children]);

  return (
    <Stack>
      <ChildrenContext.Provider
        value={{
          sectionInfo,
          available,
          childSectionInfo,
          setChildSectionInfo,
        }}
      >
        <SectionContainerCore
          sectionId={sectionId}
          parentId={parentId}
          nextId={nextId}
          sectionInfo={sectionInfo}
          dragControls={dragControls}
          hasNested={hasNested}
          childrenAreCollapsed={childrenAreCollapsed}
          flipChildrenAreCollapsed={flipChildrenAreCollapsed}
          selectedItem={selectedItem}
          setSelectedItem={setSelectedItem}
        />
      </ChildrenContext.Provider>
      <Box
        flexDirection="column"
        display={childrenAreCollapsed ? "none" : "flex"}
      >
        {hasNested &&
          order.map((e, idx) => {
            return (
              <NestedSection
                parentId={sectionId}
                sectionId={e}
                nextId={order[idx + 1]}
                sectionInfo={childSectionInfo[e]}
                available={available}
                idx={idx}
                key={`Nested-Sec-${e}`}
                depth={depth + 1}
                updatePosition={updatePosition}
                updateOrder={updateOrder}
                isCollapsed={childrenAreCollapsed}
                setIdsOverview={setIdsOverview}
                setIdNames={setIdNames}
              />
            );
          })}
      </Box>
    </Stack>
  );
}

function SectionContainerCore({
  sectionId,
  parentId,
  nextId,
  sectionInfo,
  dragControls,
  hasNested,
  childrenAreCollapsed,
  flipChildrenAreCollapsed,
  selectedItem,
  setSelectedItem,
}) {
  const refForPosition = useSetSectionPosition(sectionId);
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
      ref={refForPosition}
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
          hasNested={hasNested}
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
