import { Stack, HStack, VStack } from "@chakra-ui/react";
import { useStoreActions, useStoreState } from "easy-peasy";
import { useGetSectionInfo } from "hooks/useSectionInfo";
import { useGetSectionType } from "hooks/useSectionType";
import { useSetSectionPosition } from "hooks/useSetSectionPosition";
import React, { useState } from "react";
import {
  isListLike,
  isRoot,
  requiresKeyInput,
  SECTIONWIDTH,
} from "utils/constants";

import { SectionHeader } from "./Header/SectionHeader";
import GroupContainer from "./Main/Group/GroupContainer";
import SectionSearch from "./Main/Search/Search";
import SectionDescription from "./Main/SectionDescription/SectionDescription";

function _SectionContainerCore({
  sectionId,
  parentId,
  nextId,
  addChild,
  deleteChild,
  hasNested,
  dragListeners,
}) {
  const sectionInfo = useGetSectionInfo(sectionId);
  const { type: sectionTypeName, config } = useGetSectionType(sectionId);
  const refForPosition = useSetSectionPosition(sectionId);
  const { name: variableName, selectedItem, isTopLevel } = sectionInfo;
  const selectedItemInSpecs = config.objects.includes(selectedItem);
  const hasObjects = config.objects.length > 0;
  const isList = isListLike(config.subType);
  const isListRoot = isRoot(sectionTypeName);
  const setSectionInfoAttr = useStoreActions(
    (x) => x.sectionInfos.setSectionInfoAttr
  );
  const setActiveSection = useStoreActions((x) => x.master.setActiveSection);
  const isActiveSection =
    useStoreState((x) => x.master.activeSection) === sectionId;
  const [isActive, setIsActive] = useState(false);

  function onSelectedItemChange(value) {
    setSectionInfoAttr({ sectionId, attr: "selectedItem", value });
  }

  function onTitleInputChange(value) {
    setSectionInfoAttr({ sectionId, attr: "name", value });
  }

  // // temp_
  const tempBoolDesc = false;
  return (
    <VStack
      spacing={0}
      alignItems="stretch"
      boxShadow={isActive || isActiveSection ? "xl" : "sm"}
      borderRadius="xl"
      bg="white"
      w={`${SECTIONWIDTH}px`}
      border="2px"
      transitionDuration=".25s"
      borderColor={
        isActive ? "green.300" : isActiveSection ? "blue.300" : "white"
      }
      onClick={() => setActiveSection(sectionId)}
      onMouseDown={() => !isActive && setIsActive(true)}
      onMouseUp={() => isActive && setIsActive(false)}
    >
      <HStack
        ref={refForPosition}
        direction="column"
        bg="gray.50"
        borderRadius="xl"
        border="1px"
        px="0.5rem "
        borderColor="white"
        boxShadow="md"
        zIndex="15"
        w="100%"
        overflow="hidden"
      >
        {/* <DragHandle isTopLevel={isTopLevel} dragListeners={dragListeners} /> */}
        <Stack px=".25rem" py="1rem" w="100%">
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
            requiresKeyInput={requiresKeyInput(config.subType)}
          />
          {!isListRoot && (
            <Stack>
              {hasObjects && (
                <SectionSearch
                  sectionId={sectionId}
                  initialSelection={selectedItem}
                  onSelectedItemChange={onSelectedItemChange}
                />
              )}
              {tempBoolDesc && <SectionDescription />}
              <GroupContainer
                sectionId={sectionId}
                objInfoId={selectedItem}
                selectedItemInSpecs={selectedItemInSpecs}
                isKwarg={false}
              />
            </Stack>
          )}
        </Stack>
      </HStack>
      <VStack bg="white" borderRadius="xl" alignItems="stretch">
        <GroupContainer
          sectionId={sectionId}
          objInfoId={selectedItem}
          selectedItemInSpecs={selectedItemInSpecs}
          isKwarg={true}
        />
      </VStack>
    </VStack>
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

export default SectionContainerCore;
