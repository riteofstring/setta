import React, { useEffect } from "react";
import { useStoreActions, useStoreState } from "easy-peasy";
import SectionHeading from "./SectionElements/SectionHeading";
import { Flex, HStack } from "@chakra-ui/react";
import useOnClickOutsideRef from "../../../../utils/useOnClickOutsideRef";
import SectionUI from "./SectionElements/SectionUI";
import NestedSection from "./NestedSection";
import { getTopLevelSectionId } from "../../../../utils/sectionIds";
import Breadcrumbs from "../SectionContainer/SectionElements/Breadcrumbs/Breadcrumbs";
import NestedIncrementer from "./SectionElements/NestedIncrementer";

const SectionContainer = ({
  sectionId,
  visibleSectionIds,
  theSection,
  depth,
}) => {
  const setCurr = useStoreActions((actions) => actions.globalCurr.setCurr);
  const setSectionId = useStoreActions((actions) => actions.globalCurr.setSectionId);
  const selected = useStoreState(
    (state) => state.master.selected,
    (prev, next) => prev[sectionId] === next[sectionId]
  );
  const shiftAmount = useStoreState((state) => state.master.shiftAmount);

  const setInFocus = useStoreActions((actions) => actions.master.setInFocus);
  const inFocus = useStoreState(
    (state) => state.master.inFocus,
    (prev, next) => prev[sectionId] === next[sectionId]
  );

  const thisInFocus = inFocus[sectionId];

  console.log("sectionContainer");

  const applyFocus = () => {
    if (!thisInFocus){
      setInFocus(sectionId);
      setSectionId(sectionId);
    }
    // //     // setShiftAmount({
    // //     //   sectionId: getTopLevelSectionId(sectionId),
    // //     //   shiftAmount: depth,
    // //     // });
  };

  useEffect(() => {
    if (thisInFocus) {
      const { moduleName, name: objName } = selected[sectionId];
      if (moduleName !== undefined) {
        setCurr({ moduleName, objName });
      }
    }
  }, [thisInFocus]);

  // const maybeIncludeNestedIncrementer = () => {
  //   if (isList[sectionId]) {
  //     return <NestedIncrementer sectionId={sectionId} />;
  //   }
  //   return <></>;
  // };

  return (
    <Flex
      direction="column"
      ml={depth === 0 && `${shiftAmount[sectionId] * -2.5}rem`}
      borderRadius="md"
    >
      <Flex
        width="100%"
        bg={thisInFocus ? "gray.50" : "white"}
        onClick={() => applyFocus()}
        direction="column"
        padding="1rem 1.25rem"
        my="0.5rem"
        borderRadius="md"
        border="1px"
        borderColor="gray.200"
        id={sectionId}
      >
        {/* {getTopLevelSectionId(sectionId) === sectionId && <Breadcrumbs />} */}
        <HStack mb="1rem">
          <SectionHeading heading={theSection.name} />
          {/* {maybeIncludeNestedIncrementer()} */}
        </HStack>

        <SectionUI
          sectionId={sectionId}
          visibleSectionIds={visibleSectionIds}
          theSection={theSection}
        />
      </Flex>
      {visibleSectionIds.length > 0 &&
        visibleSectionIds.map((e, idx) => (
          <NestedSection
            sectionId={sectionId}
            visibleSectionIds={visibleSectionIds}
            e={e}
            idx={idx}
            key={`Nested-Sec-${e}-${idx}`}
            depth={depth + 1}
          />
        ))}
    </Flex>
  );
};

export default React.memo(SectionContainer);
