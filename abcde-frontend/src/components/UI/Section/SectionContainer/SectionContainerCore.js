import { HStack, Stack, VStack } from "@chakra-ui/react";
import { useStoreActions, useStoreState } from "easy-peasy";
import { useGetSectionInfo } from "hooks/useSectionInfo";
import { useGetSectionType } from "hooks/useSectionType";
import _ from "lodash";
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
}) {
  const { selectedItem } = useGetSectionInfo(sectionId);
  const { type: sectionTypeName, config } = useGetSectionType(sectionId);
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

  // // temp_
  const tempBoolDesc = false;
  return (
    <VStack
      spacing={0}
      alignItems="stretch"
      boxShadow={isActive || isActiveSection ? "2xl" : "md"}
      borderRadius="xl"
      bg="white"
      w={`${SECTIONWIDTH}px`}
      outline="4px solid"
      outlineColor={
        isActive && !isActiveSection
          ? "cyan.300"
          : isActiveSection
          ? "blue.300"
          : "transparent"
      }
      transitionDuration=".15s"
      onClick={() => setActiveSection(sectionId)}
      onMouseDown={() => !isActive && setIsActive(true)}
      onMouseUp={() => isActive && setIsActive(false)}
      // mt="0.5rem"
    >
      <HStack
        direction="column"
        bg="gray.50"
        borderRadius="xl"
        px="0.5rem"
        boxShadow="md"
        zIndex={isActiveSection ? "1000" : "10"}
        w="100%"
        border="1px"
        borderColor="white"
        overflow="hidden"
      >
        <Stack px=".25rem" py="1rem" w="100%">
          <SectionHeader
            sectionId={sectionId}
            parentId={parentId}
            nextId={nextId}
            isList={isList}
            isListRoot={isListRoot}
            addChild={addChild}
            deleteChild={deleteChild}
            hasNested={hasNested}
            requiresKeyInput={requiresKeyInput(config.subType)}
          />
          {!isListRoot && (
            <Stack>
              <SectionSearch
                sectionId={sectionId}
                initialSelection={selectedItem}
                onSelectedItemChange={onSelectedItemChange}
              />
              {tempBoolDesc && <SectionDescription />}
              <GroupContainer
                sectionId={sectionId}
                objInfoId={selectedItem}
                isKwarg={false}
              />
            </Stack>
          )}
        </Stack>
      </HStack>

      <GroupContainer
        sectionId={sectionId}
        objInfoId={selectedItem}
        isKwarg={true}
      />
    </VStack>
  );
}

const SectionContainerCore = React.memo(_SectionContainerCore, (prev, next) => {
  const attrs = ["addChild", "deleteChild", "nextId", "hasNested"];
  for (let k of attrs) {
    if (!_.isEqual(prev[k], next[k])) {
      return false;
    }
  }
  return true;
});

export default SectionContainerCore;
