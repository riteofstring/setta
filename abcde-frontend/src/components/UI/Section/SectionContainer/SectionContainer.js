import { DragHandleIcon } from "@chakra-ui/icons";
import { Stack, HStack, Box } from "@chakra-ui/react";
import { useStoreState } from "easy-peasy";
import React, { useState } from "react";

import {
  isListLike,
  isRoot,
  requiresKeyInput,
  SECTIONWIDTH,
} from "../../../../utils/constants";
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
  const isRendered = useStoreState((x) => x.sectionInfos.isRendered[sectionId]);
  const [idsOverview, setIdsOverview] = useIdsOverview(sectionId);
  const [selectedItem, setSelectedItem] = useState({});
  const [childrenAreCollapsed, setChildrenAreCollapsed] = useState(false);
  const hasNested = idsOverview.length > 0;

  const addChild = useAddChild(sectionId);
  const deleteChild = useDeleteChild(sectionId);

  const flipChildrenAreCollapsed = funcFlipChildrenAreCollapsed(
    childrenAreCollapsed,
    setChildrenAreCollapsed
  );

  return isRendered ? (
    <Stack>
      <SectionContainerCore
        sectionId={sectionId}
        parentId={parentId}
        nextId={nextId}
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
  ) : (
    <></>
  );
}

function SectionContainerCore({
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
  const isList = isListLike(sectionType.name);
  const isListRoot = isRoot(sectionType.name);

  function onSelectedItemChange(inputSelectedItem) {
    if (inputSelectedItem) {
      setSelectedItem(inputSelectedItem);
    }
  }

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
