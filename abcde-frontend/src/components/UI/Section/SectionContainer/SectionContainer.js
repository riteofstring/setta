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
import { v4 as uuidv4 } from "uuid";
import { SectionInfo } from "../../../../classes/jsonParser";
import { insertIntoArrayOrPrepend, rangeArray } from "../../../../utils/utils";
import _ from "lodash";

export const ChildrenContext = React.createContext(null);

function funcAddChild(
  sectionInfo,
  available,
  children,
  childSectionInfo,
  setChildren,
  setChildSectionInfo
) {
  function addChild(
    childVariableName,
    uiType,
    startId = null,
    numChildren = 1
  ) {
    let newIds = [];
    let newInfos = {};
    for (let i = 0; i < numChildren; i++) {
      const newId = uuidv4();
      newIds.push(newId);
      if (!childVariableName) {
        childVariableName = sectionInfo.name;
      }
      let [config, isList, isListRoot] = [null, null, null];
      if (!uiType) {
        ({ specs: config, isList, isListRoot } = sectionInfo);
        if (isListRoot) {
          isList = true;
          isListRoot = false;
        }
      } else {
        ({ config, isList, isListRoot } = uiType);
      }
      newInfos[newId] = new SectionInfo(
        childVariableName,
        config,
        available,
        isList,
        isListRoot
      );
    }

    let insertIdx = null;
    if (startId !== null) {
      insertIdx = children.indexOf(startId) + 1;
    }
    setChildren(insertIntoArrayOrPrepend(children, insertIdx, ...newIds));
    setChildSectionInfo({
      ...newInfos,
      ...childSectionInfo,
    });
  }
  return addChild;
}

function funcDeleteChild(
  children,
  childSectionInfo,
  setChildren,
  setChildSectionInfo
) {
  function deleteChild(startId = null, numChildren = 1) {
    if (children.length === 0) {
      return;
    }
    let startIdx = 0;
    if (startId !== null) {
      startIdx = children.indexOf(startId) + 1;
    }
    const endIdx = startIdx + numChildren;
    const newChildren = children.filter(
      (e, idx) => !(idx >= startIdx && idx < endIdx)
    );
    setChildSectionInfo(_.pick(childSectionInfo, newChildren));
    setChildren(newChildren);
  }
  return deleteChild;
}

function SectionContainer({
  sectionId,
  parentId,
  nextId,
  sectionInfo,
  available,
  depth,
  dragControls,
  parentControls,
}) {
  const refForPosition = useSetSectionPosition(sectionId);

  const [children, setChildren] = useState([]);
  const [childSectionInfo, setChildSectionInfo] = useState({});

  const [order, updatePosition, updateOrder] = usePositionReorder(children);

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

  // console.log("SectionContainer", sectionId, nextId, children, order);

  useEffect(() => {
    if (!arraysAreEqual(children, order)) {
      setChildren(order);
    }
  }, [order]);

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
        />
      </ChildrenContext.Provider>
      {order.length > 0 &&
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
}) {
  // const { isList, isListRoot, requiresKeyInput } = useStoreState((state) =>
  //   state.master.sections.getUIType(sectionId)
  // );

  const { name: variableName, moduleInfos, isList, isListRoot } = sectionInfo;
  const showSearch = Object.keys(moduleInfos).length > 0;

  const [paramInfos, setParamInfos] = useState(sectionInfo.parameterInfos);

  function onSelectedItemChange(selectedItem) {
    if (selectedItem) {
      const [moduleName, objName] = selectedItem;
      setParamInfos(moduleInfos[moduleName].objs[objName].params);
    }
  }

  console.log("paramInfos", variableName, paramInfos);
  console.log("dragControls", dragControls);

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
                onSelectedItemChange={onSelectedItemChange}
              />
            )}
            {tempBoolDesc && <SectionDescription />}
            <GroupContainer sectionId={sectionId} paramInfos={paramInfos} />
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
