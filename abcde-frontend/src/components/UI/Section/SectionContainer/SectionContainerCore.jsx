import { HStack, Stack, VStack } from "@chakra-ui/react";
import { useGetSectionConfig } from "hooks/useSectionConfig";
import { useGetSectionType } from "hooks/useSectionType";
import _ from "lodash";
import { useActiveSection } from "models/activeSection";
import React, { useState } from "react";
import { setSectionConfigAttr } from "thunks/sections";
import { isRoot, isSeriesElement, SECTIONWIDTH } from "utils/constants";
import { SectionHeader } from "./Header/SectionHeader";
import {
  KwargGroupContainer,
  ParamGroupContainer,
} from "./Main/Group/GroupContainer";
import SectionSearch from "./Main/Search/Search";
import SectionDescription from "./Main/SectionDescription/SectionDescription";

function _SectionContainerCore({ sectionId, parentId, nextId, hasNested }) {
  const [selectedItem] = useGetSectionConfig(sectionId, ["selectedItem"]);
  const [sectionTypeName, config] = useGetSectionType(sectionId, [
    "type",
    "config",
  ]);
  const _isSeriesElement = isSeriesElement(config.subType);
  const _isRoot = isRoot(sectionTypeName);
  const isActiveSection = useActiveSection((x) => x.id) === sectionId;
  const setActiveSection = useActiveSection((x) => x.setId);
  const [isActive, setIsActive] = useState(false);

  function onSelectedItemChange(value) {
    setSectionConfigAttr({
      sectionId,
      attr: "selectedItem",
      value,
    });
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
      data-testid={`${sectionId} section core`}
      // mt="0.5rem"
    >
      <HStack
        direction="column"
        bg="gray.50"
        borderRadius="xl"
        px="0.5rem"
        boxShadow="md"
        zIndex={isActiveSection ? "150" : "10"}
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
            isSeriesElement={_isSeriesElement}
            isRoot={_isRoot}
            hasNested={hasNested}
          />
          {!_isRoot && (
            <Stack>
              <SectionSearch
                sectionId={sectionId}
                initialSelection={selectedItem}
                onSelectedItemChange={onSelectedItemChange}
              />
              {tempBoolDesc && <SectionDescription />}
              <ParamGroupContainer
                sectionId={sectionId}
                objInfoId={selectedItem}
              />
            </Stack>
          )}
        </Stack>
      </HStack>
      <KwargGroupContainer sectionId={sectionId} objInfoId={selectedItem} />
    </VStack>
  );
}

const SectionContainerCore = React.memo(_SectionContainerCore, (prev, next) => {
  const attrs = ["nextId", "hasNested"];
  for (let k of attrs) {
    if (!_.isEqual(prev[k], next[k])) {
      return false;
    }
  }
  return true;
});

export default SectionContainerCore;
