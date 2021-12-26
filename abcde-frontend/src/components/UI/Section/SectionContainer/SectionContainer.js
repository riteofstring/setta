import { DragHandleIcon } from "@chakra-ui/icons";
import { Stack, HStack, Box } from "@chakra-ui/react";
import { useStoreActions, useStoreState } from "easy-peasy";
import React, { useState, useCallback } from "react";

import {
  useGetSectionInfo,
  useGetSectionType,
  useAddChild,
  useDeleteChild,
} from "../../../../hooks/useCreateInfo";
import { useIdsOverview } from "../../../../hooks/useIdsOverview";
import { useSetSectionPosition } from "../../../../hooks/useSetSectionPosition";
import {
  isListLike,
  isRoot,
  requiresKeyInput,
  SECTIONWIDTH,
} from "../../../../utils/constants";
import ManyNestedSections from "../NestedSection/ManyNestedSections";
import SectionFooter from "./Footer/SectionFooter";
import { SectionHeader } from "./Header/SectionHeader";
import GroupContainer from "./Main/Group/GroupContainer";
import SectionSearch from "./Main/Search/Search";
import SectionDescription from "./Main/SectionDescription/SectionDescription";

function SectionContainer({
  sectionId,
  parentId,
  nextId,
  depth,
  dragListeners,
}) {
  const isRendered = useGetSectionInfo(sectionId).isRendered;
  const [idsOverview, setIdsOverview] = useIdsOverview(sectionId);
  const [childrenAreCollapsed, setChildrenAreCollapsed] = useState(false);
  const hasNested = useStoreState((x) => x.sectionInfos.hasNested[sectionId]);

  console.log("SectionContainer");

  const addChild = useAddChild(sectionId);
  const deleteChild = useDeleteChild(sectionId);

  const flipChildrenAreCollapsed = useCallback(() => {
    setChildrenAreCollapsed(!childrenAreCollapsed);
  }, [childrenAreCollapsed]);

  return isRendered ? (
    <Stack>
      <SectionContainerCore
        sectionId={sectionId}
        parentId={parentId}
        nextId={nextId}
        addChild={addChild}
        deleteChild={deleteChild}
        hasNested={hasNested}
        childrenAreCollapsed={childrenAreCollapsed}
        flipChildrenAreCollapsed={flipChildrenAreCollapsed}
        dragListeners={dragListeners}
      />
      <Box
        flexDirection="column"
        display={childrenAreCollapsed ? "none" : "flex"}
      >
        {hasNested && (
          <ManyNestedSections
            childIds={idsOverview}
            sectionId={sectionId}
            depth={depth}
            setChildren={setIdsOverview}
          />
        )}
      </Box>
    </Stack>
  ) : (
    <></>
  );
}

function _SectionContainerCore({
  sectionId,
  parentId,
  nextId,
  addChild,
  deleteChild,
  hasNested,
  childrenAreCollapsed,
  flipChildrenAreCollapsed,
  dragListeners,
}) {
  const sectionInfo = useGetSectionInfo(sectionId);
  const sectionType = useGetSectionType(sectionId);
  const refForPosition = useSetSectionPosition(sectionId);
  const { name: variableName, selectedItem } = sectionInfo;
  const showSearch = sectionType.hasObjects;
  const isList = isListLike(sectionType.name);
  const isListRoot = isRoot(sectionType.name);
  const setSectionInfoAttr = useStoreActions(
    (x) => x.sectionInfos.setSectionInfoAttr
  );

  function onSelectedItemChange(value) {
    setSectionInfoAttr({ sectionId, attr: "selectedItem", value });
  }

  function onTitleInputChange(value) {
    setSectionInfoAttr({ sectionId, attr: "name", value });
  }

  console.log("SectionContainerCore");

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
          hasNested={hasNested}
          onTitleInputChange={onTitleInputChange}
          requiresKeyInput={requiresKeyInput(sectionType.name)}
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
            <GroupContainer sectionId={sectionId} objInfoId={selectedItem} />
            <SectionFooter
              sectionId={sectionId}
              objInfoId={selectedItem}
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

const SectionContainerCore = React.memo(_SectionContainerCore, (prev, next) => {
  const attrs = [
    "addChild",
    "deleteChild",
    "childrenAreCollapsed",
    "nextId",
    "hasNested",
  ];
  for (let k of attrs) {
    if (!_.isEqual(prev[k], next[k])) {
      return false;
    }
  }
  return true;
});

export default React.memo(SectionContainer, (prev, next) => {
  return prev.nextId === next.nextId;
});
