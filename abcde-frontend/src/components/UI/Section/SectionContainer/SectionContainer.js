import React, { useEffect, useState } from "react";
import { Stack, HStack, Box } from "@chakra-ui/react";
import { DragHandleIcon } from "@chakra-ui/icons";
import GroupContainer from "./Main/Group/GroupContainer";
import SectionSearch from "./Main/Search/Search";
import { SectionHeader } from "./Header/SectionHeader";
import SectionFooter from "./Footer/SectionFooter";
import ManyNestedSections from "../NestedSection/ManyNestedSections";
import { SECTIONWIDTH } from "../../../../utils/constants";
import { useSetSectionPosition } from "../../../../utils/useSetSectionPosition";
import SectionDescription from "./Main/SectionDescription/SectionDescription";
import {
  funcAddChild,
  funcDeleteChild,
  funcFlipChildrenAreCollapsed,
} from "./SectionContainerUtils";
import { useStoreState, useStoreActions } from "easy-peasy";
import { curryAction, defaultState } from "../../../../utils/utils";

export const ChildrenContext = React.createContext(null);

function SectionContainerWrapper({ sectionId, ...props }) {
  const setIdsOverview = curryAction(
    useStoreActions((x) => x.sections.setIdsOverview),
    { sectionId },
    "children"
  );
  const idsOverview = defaultState(
    useStoreState((x) => x.sections.idsOverview[sectionId]),
    []
  );
  return (
    <SectionContainer
      sectionId={sectionId}
      {...props}
      idsOverview={idsOverview}
      setIdsOverview={setIdsOverview}
    />
  );
}

function SectionContainer({
  sectionId,
  parentId,
  nextId,
  sectionInfo,
  available,
  depth,
  parentControls,
  isCollapsed,
  idsOverview,
  setIdsOverview,
  setIdNames,
  dragListeners,
}) {
  const [selectedItem, setSelectedItem] = useState([]);
  const [childSectionInfo, setChildSectionInfo] = useState({});
  const [childrenAreCollapsed, setChildrenAreCollapsed] = useState(false);
  const hasNested = idsOverview.length > 0;

  const addChild = funcAddChild(
    sectionInfo,
    available,
    idsOverview,
    childSectionInfo,
    setIdsOverview,
    setChildSectionInfo
  );

  const deleteChild = funcDeleteChild(
    idsOverview,
    childSectionInfo,
    setIdsOverview,
    setChildSectionInfo
  );

  const flipChildrenAreCollapsed = funcFlipChildrenAreCollapsed(
    childrenAreCollapsed,
    setChildrenAreCollapsed
  );

  useEffect(() => {
    setChildrenAreCollapsed(isCollapsed);
  }, [isCollapsed]);

  useEffect(() => {
    setIdNames({ sectionId, name: sectionInfo.name });
  }, [idsOverview]);

  return (
    <Stack>
      <ChildrenContext.Provider value={{ addChild }}>
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
          dragListeners={dragListeners}
        />
      </ChildrenContext.Provider>
      <Box
        flexDirection="column"
        display={childrenAreCollapsed ? "none" : "flex"}
      >
        {hasNested && (
          <ManyNestedSections
            childIds={idsOverview}
            sectionId={sectionId}
            childSectionInfo={childSectionInfo}
            available={available}
            parentControls={{ addChild, deleteChild }}
            depth={depth}
            isCollapsed={childrenAreCollapsed}
            setIdNames={setIdNames}
            setChildren={setIdsOverview}
          />
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
  dragListeners,
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
      {isList && <DragHandle dragListeners={dragListeners} />}
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

function DragHandle({ dragListeners }) {
  return (
    <HStack
      alignSelf="stretch"
      borderLeftRadius="inherit"
      cursor="move"
      px="0.5rem"
      bg="gray.100"
      className="DragHandle"
      {...dragListeners}
    >
      <DragHandleIcon size="sm" color="gray.300" />
    </HStack>
  );
}

export default React.memo(SectionContainerWrapper);
