import React, { useState, useEffect } from "react";
import { useStoreActions, useStoreState } from "easy-peasy";
import SectionHeading from "./SectionElements/SectionHeading";
import { Flex, HStack } from "@chakra-ui/react";
import useOnClickOutsideRef from "../../../../utils/useOnClickOutsideRef";
import SectionUI from "./SectionElements/SectionUI";
import NestedSection from "./NestedSection";
import {
  getTopLevelSectionId,
  getSectionOrder,
} from "../../../../utils/sectionIds";
import Breadcrumbs from "../SectionContainer/SectionElements/Breadcrumbs/Breadcrumbs";
import NestedIncrementer from "./SectionElements/NestedIncrementer";

const SectionContainer = ({
  sectionId,
  visibleSectionIds,
  theSection,
  depth,
}) => {
  const [focus, setFocus] = useState(false);

  const ref = useOnClickOutsideRef(() => setFocus(false));
  const { setActiveObj, setShiftAmount } = useStoreActions(
    (actions) => actions.master
  );
  const { shiftAmount } = useStoreState((state) => state.master);
  const { activeObj, isList } = useStoreState((state) => state.master);

  const applyFocus = () => {
    setActiveObj(sectionId);
    setFocus(true);
  };

  useEffect(() => {
    if (activeObj === sectionId) {
      setShiftAmount({
        sectionId: getTopLevelSectionId(sectionId),
        shiftAmount: depth,
      });
      setFocus(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeObj]);

  const maybeIncludeNestedIncrementer = () => {
    if (isList[sectionId]) {
      return <NestedIncrementer sectionId={sectionId} />;
    }
    return <></>;
  };

  return (
    <Flex
      direction="column"
      ml={depth === 0 && `${shiftAmount[sectionId] * -2.5}rem`}
      borderRadius="md"
    >
      <Flex
        width="100%"
        bg={focus ? "gray.50" : "white"}
        onClick={() => applyFocus()}
        ref={ref}
        direction="column"
        padding="1rem 1.25rem"
        my="0.5rem"
        borderRadius="md"
        border="1px"
        borderColor="gray.200"
        id={sectionId}
      >
        {getTopLevelSectionId(activeObj) === sectionId && <Breadcrumbs />}
        <HStack mb="1rem">
          <SectionHeading heading={theSection.name} />
          {maybeIncludeNestedIncrementer()}
        </HStack>

        <SectionUI
          sectionId={sectionId}
          visibleSectionIds={visibleSectionIds}
          theSection={theSection}
        />
      </Flex>
      {Object.keys(visibleSectionIds).length > 0 &&
        getSectionOrder(visibleSectionIds).map((e, idx) => (
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
