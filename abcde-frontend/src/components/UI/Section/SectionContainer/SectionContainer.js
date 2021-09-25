import React, { useEffect, useState } from "react";
import { Stack, HStack, Box } from "@chakra-ui/react";
import { DragHandleIcon } from "@chakra-ui/icons";
import GroupContainer from "./Main/Group/GroupContainer";
import SectionSearch from "./Main/Search/Search";
import { SectionHeader } from "./Header/SectionHeader";
import SectionFooter from "./Footer/SectionFooter";
import NestedSection from "../NestedSection/NestedSection";
import { SECTIONWIDTH } from "../../../../utils/constants";
import { useSetSectionPosition } from "../../../../utils/useSetSectionPosition";
import SectionDescription from "./Main/SectionDescription/SectionDescription";
import {
  funcAddChild,
  funcDeleteChild,
  funcFlipChildrenAreCollapsed,
} from "./SectionContainerUtils";
import { Container, Draggable } from "react-smooth-dnd";
import { arrayMoveImmutable } from "array-move";

export const ChildrenContext = React.createContext(null);

function SectionContainer({
  sectionId,
  parentId,
  nextId,
  sectionInfo,
  available,
  depth,
  parentControls,
  isCollapsed,
  setIdsOverview,
  setIdNames,
}) {
  const [selectedItem, setSelectedItem] = useState([]);
  const [children, setChildren] = useState([]);
  const [childSectionInfo, setChildSectionInfo] = useState({});
  const [childrenAreCollapsed, setChildrenAreCollapsed] = useState(false);
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

  const onDrop = (dropResult) => {
    const { removedIndex, addedIndex } = dropResult;
    setChildren(arrayMoveImmutable(children, removedIndex, addedIndex));
  };

  useEffect(() => {
    setChildrenAreCollapsed(isCollapsed);
  }, [isCollapsed]);

  useEffect(() => {
    setIdsOverview({ sectionId, children });
    setIdNames({ sectionId, name: sectionInfo.name });
  }, [children]);

  return (
    <Stack>
      <ChildrenContext.Provider value={{ children, addChild }}>
        <SectionContainerCore
          sectionId={sectionId}
          parentId={parentId}
          nextId={nextId}
          sectionInfo={sectionInfo}
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
      <Box
        flexDirection="column"
        display={childrenAreCollapsed ? "none" : "flex"}
      >
        {hasNested && (
          <Container
            onDrop={onDrop}
            dragHandleSelector=".DragHandle"
            getGhostParent={() => document.body}
            animationDuration={100}
          >
            {children.map((e, idx) => (
              <Draggable key={`Nested-Sec-${e}`}>
                <NestedSection
                  parentId={sectionId}
                  sectionId={e}
                  nextId={children[idx + 1]}
                  sectionInfo={childSectionInfo[e]}
                  available={available}
                  parentControls={{ addChild, deleteChild }}
                  idx={idx}
                  // key={`Nested-Sec-${e}`}
                  depth={depth + 1}
                  isCollapsed={childrenAreCollapsed}
                  setIdsOverview={setIdsOverview}
                  setIdNames={setIdNames}
                />
              </Draggable>
            ))}
          </Container>
        )}
      </Box>
    </Stack>
  );
}

function SectionContainerCore({
  sectionId,
  parentId,
  nextId,
  sectionInfo,
  addChild,
  deleteChild,
  parentControls,
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
      {isList && <DragHandle />}
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

function DragHandle() {
  return (
    <HStack
      alignSelf="stretch"
      borderLeftRadius="inherit"
      cursor="move"
      px="0.5rem"
      bg="gray.100"
      className="DragHandle"
    >
      <DragHandleIcon size="sm" color="gray.300" />
    </HStack>
  );
}

export default React.memo(SectionContainer);
