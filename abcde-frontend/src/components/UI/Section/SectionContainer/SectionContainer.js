import { DragHandleIcon } from "@chakra-ui/icons";
import { Stack, HStack, Box } from "@chakra-ui/react";
import React, { useEffect, useState, useRef, useCallback } from "react";

import { LIST, LIST_ROOT, SECTIONWIDTH } from "../../../../utils/constants";
import {
  useGetSectionInfo,
  useGetSectionType,
} from "../../../../utils/useCreateInfo";
import { useIdsOverview } from "../../../../utils/useIdsOverview";
import { useSetSectionPosition } from "../../../../utils/useSetSectionPosition";
import ManyNestedSections from "../NestedSection/ManyNestedSections";
import SectionFooter from "./Footer/SectionFooter";
import { SectionHeader } from "./Header/SectionHeader";
import GroupContainer from "./Main/Group/GroupContainer";
import SectionSearch from "./Main/Search/Search";
import SectionDescription from "./Main/SectionDescription/SectionDescription";
import {
  useAddChild,
  funcFlipChildrenAreCollapsed,
  useDeleteChild,
} from "./SectionContainerUtils";

function SectionContainer({
  sectionId,
  parentId,
  nextId,
  depth,
  parentControls,
  dragListeners,
}) {
  // const isRendered = useIsEqual((x) => x.sectionInfos.isRendered[sectionId]);
  const [idsOverview, setIdsOverview] = useIdsOverview(sectionId);
  const [selectedItem, setSelectedItem] = useState({});
  const [childrenAreCollapsed, setChildrenAreCollapsed] = useState(false);
  const hasNested = idsOverview.length > 0;

  console.log("idsOverview", idsOverview)

  const addChild = useCallback(useAddChild(sectionId), []);
  const deleteChild = useCallback(useDeleteChild(sectionId), []);

  const flipChildrenAreCollapsed = useCallback(
    funcFlipChildrenAreCollapsed(childrenAreCollapsed, setChildrenAreCollapsed),
    [childrenAreCollapsed]
  );

  return (
    <Stack>
      <SectionContainerCore
        sectionId={sectionId}
        parentId={parentId}
        nextId={nextId}
        addChild={addChild}
        deleteChild={deleteChild}
        // parentControls={parentControls}
        hasNested={hasNested}
        childrenAreCollapsed={childrenAreCollapsed}
        flipChildrenAreCollapsed={flipChildrenAreCollapsed}
        selectedItem={selectedItem}
        setSelectedItem={setSelectedItem}
        // dragListeners={dragListeners}
      />
      <Box
        flexDirection="column"
        display={childrenAreCollapsed ? "none" : "flex"}
      >
        {hasNested && (
          <ManyNestedSections
            childIds={idsOverview}
            sectionId={sectionId}
            parentControls={{ addChild, deleteChild }}
            depth={depth}
            setChildren={setIdsOverview}
          />
        )}
      </Box>
    </Stack>
  );
}

function _SectionContainerCore({
  sectionId,
  parentId,
  nextId,
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
  const sectionInfo = useGetSectionInfo(sectionId);
  const sectionType = useGetSectionType(sectionId);
  const refForPosition = useSetSectionPosition(sectionId);
  const variableName = sectionInfo.name;
  const showSearch = sectionType.hasObjects;
  const isList = sectionType.name === LIST;
  const isListRoot = sectionType.name === LIST_ROOT;

  function onSelectedItemChange(inputSelectedItem) {
    if (inputSelectedItem) {
      setSelectedItem(inputSelectedItem);
    }
  }

  useTraceUpdate({
    sectionId,
    parentId,
    nextId,
    addChild,
    deleteChild,
    parentControls,
    hasNested,
    childrenAreCollapsed,
    flipChildrenAreCollapsed,
    selectedItem,
    setSelectedItem,
    dragListeners,
  });

  console.log("SectionContainerCore", variableName);

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
                sectionId={sectionId}
                initialSelection={selectedItem}
                onSelectedItemChange={onSelectedItemChange}
              />
            )}
            {tempBoolDesc && <SectionDescription />}
            <GroupContainer sectionId={sectionId} objInfo={selectedItem} />
            <SectionFooter
              sectionId={sectionId}
              objInfo={selectedItem}
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

export default React.memo(SectionContainer);

const SectionContainerCore = React.memo(
  _SectionContainerCore
  // (prevProps, nextProps) =>
  //   prevProps.sectionId === nextProps.sectionId &&
  //   prevProps.hasNested === nextProps.hasNested
);

function useTraceUpdate(props) {
  const prev = useRef(props);
  useEffect(() => {
    const changedProps = Object.entries(props).reduce((ps, [k, v]) => {
      if (prev.current[k] !== v) {
        ps[k] = [prev.current[k], v];
      }
      return ps;
    }, {});
    if (Object.keys(changedProps).length > 0) {
      console.log("Changed props:", changedProps);
    }
    prev.current = props;
  });
}
